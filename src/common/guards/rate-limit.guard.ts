import { Injectable, CanActivate, ExecutionContext, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../../common/decorators/rate-limit.decorator';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import type Redis from 'ioredis';
import * as crypto from 'crypto';
import { REDIS } from '../../modules/redis/redis.module';

/**
 * RateLimitGuard
 *
 * - Looks for per-route @RateLimit metadata (handler -> class -> default).
 * - Builds/uses a RateLimiterRedis instance per {limit,windowMs} (cached).
 * - Keying: uses user id if available, otherwise anonymized hashed IP.
 * - If Redis is not available it falls back to an in-memory sliding window (bounded).
 *
 * Requirements:
 * - Provide 'REDIS' provider in DI that yields an ioredis client (see module snippet below).
 * - Recommended to set `app.set('trust proxy', true)` in express if behind proxy so req.ip is correct.
 */

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  // cache limiter instances keyed by "limit:windowMs"
  private limiterCache = new Map<string, RateLimiterRedis>();

  // In-memory fallback store (bounded) -- map of key -> timestamps[]; used only when Redis absent
  private fallbackStore = new Map<string, number[]>();
  private fallbackCleanupIntervalMs = 60 * 1000; // cleanup interval
  private fallbackMaxKeys = 10_000; // cap size to avoid memory explosion

  constructor(
    private readonly reflector: Reflector,
    @Inject('REDIS') private readonly redisClient?: Redis | null, // Injected Redis client
  ) {
    // start cleanup timer for fallback store
    setInterval(() => this.cleanupFallbackStore(), this.fallbackCleanupIntervalMs).unref();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts: RateLimitOptions | undefined =
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler()) ||
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getClass());

    const limit = opts ?? { points: 100, duration: 60 }; // default: 100 req / 60s

    const req = context.switchToHttp().getRequest();
    const user = (req as any).user;
    const rawIp = this.extractClientIp(req);

    // build anonymized key: prefer user id if logged in, otherwise hashed ip
    const key = this.buildKey(user, rawIp);

    // If Redis client is available, use rate-limiter-flexible with Redis store (distributed)
    if (this.redisClient && (this.redisClient as any).status === 'ready') {
      const limiter = this.getOrCreateLimiter(limit.points, limit.duration);
      try {
        // consume 1 point for this request
        await limiter.consume(key, 1);
        return true;
      } catch (rlRejected) {
        // rlRejected can be RateLimiterRes; it has msBeforeNext (ms to wait)
        // Explicitly type rlRejected as RateLimiterRes
        const rateLimiterRes = rlRejected as import('rate-limiter-flexible').RateLimiterRes;
        const retryAfterSeconds = Math.ceil((rateLimiterRes?.msBeforeNext ?? limit.duration * 1000) / 1000);
        // Set Retry-After header via exception (controller/adapters can add it)
        throw new HttpException(
          {
            status: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too many requests',
            retryAfter: retryAfterSeconds
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // No Redis -> fallback to in-memory sliding window with bounded memory
    return this.fallbackHandle(key, limit.points, limit.duration);
  }


  private getOrCreateLimiter(points: number, duration: number): RateLimiterRedis {
    const cacheKey = `${points}:${duration}`;
    if (!this.limiterCache.has(cacheKey)) {
      const limiter = new RateLimiterRedis({
        storeClient: this.redisClient as Redis,
        points, // number of points
        duration, // per sec
        blockDuration: 0, // 0 => use msBeforeNext instead of blocking
        keyPrefix: 'rlf', // prefix for redis keys
      });
      this.limiterCache.set(cacheKey, limiter);
    }
    return this.limiterCache.get(cacheKey) as RateLimiterRedis;
  }

  private buildKey(user: any, rawIp?: string | null): string {
    if (user && (user.id || user.sub)) {
      const id = user.id ?? user.sub;
      return `user:${id}`;
    }
    const ip = rawIp ?? 'unknown';
    // anonymize/hash IP so we don't store PII in Redis or logs
    const hash = crypto.createHash('sha256').update(ip).digest('hex');
    // shorten a bit to keep keys reasonable
    return `ip:${hash.slice(0, 40)}`;
  }

  private extractClientIp(req: any): string | null {
    if (!req) return null;
    // prefer x-forwarded-for if behind proxy (ensure trust proxy set in app)
    const xff = req.headers?.['x-forwarded-for'];
    if (xff && typeof xff === 'string') {
      return xff.split(',')[0].trim();
    }
    // Express sets req.ip
    if (req.ip) return req.ip;
    if (req.connection?.remoteAddress) return req.connection.remoteAddress;
    return null;
  }

  // In-memory fallback: simple sliding window in timestamps; bounded by fallbackMaxKeys
  private fallbackHandle(key: string, max: number, windowSec: number): boolean {
    const now = Date.now();
    const windowStart = now - windowSec * 1000;
    let arr = this.fallbackStore.get(key);
    if (!arr) {
      if (this.fallbackStore.size >= this.fallbackMaxKeys) {
        // if store is full, allow but log a warning (avoids DoS by filling memory)
        this.logger.warn('Fallback store at capacity; allowing request to avoid OOM');
        return true;
      }
      arr = [];
    }
    // drop old timestamps
    while (arr.length && arr[0] <= windowStart) {
      arr.shift();
    }
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowSec * 1000 - now) / 1000);
      throw new HttpException(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too many requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    arr.push(now);
    this.fallbackStore.set(key, arr);
    return true;
  }

  private cleanupFallbackStore() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // remove entries older than 5 minutes
    for (const [k, arr] of this.fallbackStore.entries()) {
      if (!arr.length || arr[arr.length - 1] < now - maxAge) {
        this.fallbackStore.delete(k);
      }
    }
  }

}