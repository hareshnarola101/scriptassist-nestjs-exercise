import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RedisService } from '../cache/redis.service';
import type { Request } from 'express';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { RateLimitOptions } from '@common/interfaces/rate-limit-options.interface';

// Inefficient in-memory storage for rate limiting
// Problems:
// 1. Not distributed - breaks in multi-instance deployments
// 2. Memory leak - no cleanup mechanism for old entries
// 3. No persistence - resets on application restart
// 4. Inefficient data structure for lookups in large datasets
// const requestRecords: Record<string, { count: number, timestamp: number }[]> = {};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    
    const rateLimitOptions = this.reflector.get<Required<RateLimitOptions>>(
      RATE_LIMIT_KEY,
      handler,
    );

    if (!rateLimitOptions) {
      return true;
    }

    // Skip rate limiting if configured
    if (rateLimitOptions.skipIf?.(request)) {
      return true;
    }

    const key = this.generateKey(request, rateLimitOptions);
    const current = await this.getCurrentCount(key, rateLimitOptions);

    if (current >= rateLimitOptions.limit) {
      this.logger.warn(`Rate limit exceeded for key: ${key}`);
      throw new HttpException(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          error: rateLimitOptions.errorMessage,
          limit: rateLimitOptions.limit,
          remaining: 0,
          reset: await this.getResetTime(key, rateLimitOptions),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.incrementCount(key, rateLimitOptions);
    return true;
  }

  private generateKey(req: Request, options: Required<RateLimitOptions>): string {
    const identifier = options.keyGenerator(req);
    return `rate_limit:${options.prefix}:${identifier}`;
  }

  private async getCurrentCount(
    key: string,
    options: RateLimitOptions,
  ): Promise<number> {
    try {
      const count = await this.redisService.get(key);
      return parseInt(count || '0', 10);
    } catch (error) {
      this.logger.error('Failed to get rate limit count', error instanceof Error ? error.stack : String(error));
      return 0;  // Fail open in case of Redis issues
    }
  }

  private async incrementCount(
    key: string,
    options: RateLimitOptions,
  ): Promise<void> {
    try {
      await this.redisService.increment(key);
      await this.redisService.expire(key, options.windowMs / 1000);
    } catch (error) {
      this.logger.error('Failed to increment rate limit count', error instanceof Error ? error.stack : String(error));
    }
  }

  private async getResetTime(
    key: string,
    options: RateLimitOptions,
  ): Promise<number> {
    try {
      const ttl = await this.redisService.getTtl(key);
      return ttl > 0 ? ttl : options.windowMs / 1000;
    } catch (error) {
      this.logger.error('Failed to get rate limit TTL', error instanceof Error ? error.stack : String(error));
      return options.windowMs / 1000;
    }
  }

}