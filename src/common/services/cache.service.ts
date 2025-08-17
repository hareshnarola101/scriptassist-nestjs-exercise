import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly namespace: string;
  private readonly defaultTTL: number;

  constructor(private readonly configService: ConfigService) {
    // Create Redis client with proper configuration
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      keyPrefix: this.configService.get('REDIS_PREFIX', 'cache:'),
      lazyConnect: true,
    });

    // Initialize connection
    this.redis.connect().catch(err => {
      this.logger.error(`Redis connection failed: ${err.message}`);
    });

    this.namespace = this.configService.get('CACHE_NAMESPACE', 'app') + ':';
    this.defaultTTL = this.configService.get('CACHE_TTL', 300);
    
    // Register event handlers
    this.redis.on('connect', () => this.logger.log('Redis connected'));
    this.redis.on('ready', () => this.logger.log('Redis ready'));
    this.redis.on('error', err => this.logger.error(`Redis error: ${err.message}`));
    this.redis.on('reconnecting', () => this.logger.warn('Redis reconnecting'));
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = this.defaultTTL
  ): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    
    try {
      const serialized = JSON.stringify({
        data: value,
        meta: {
          serializedAt: new Date().toISOString(),
          uuid: uuidv4(),
        }
      });

      if (ttlSeconds > 0) {
        await this.redis.setex(namespacedKey, ttlSeconds, serialized);
      } else {
        await this.redis.set(namespacedKey, serialized);
      }
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to set key ${namespacedKey}: ${errorMsg}`);
      throw new Error('Cache set operation failed');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key);
    
    try {
      const result = await this.redis.get(namespacedKey);
      if (!result) return null;

      const parsed = JSON.parse(result);
      return parsed.data;
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to get key ${namespacedKey}: ${errorMsg}`);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    
    try {
      const result = await this.redis.del(namespacedKey);
      return result > 0;
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to delete key ${namespacedKey}: ${errorMsg}`);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    
    try {
      const result = await this.redis.exists(namespacedKey);
      return result === 1;
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to check key ${namespacedKey}: ${errorMsg}`);
      return false;
    }
  }

  async clearNamespace(): Promise<void> {
    try {
      const pattern = `${this.namespace}*`;
      const stream = this.redis.scanStream({ match: pattern });
      
      let keys: string[] = [];
      for await (const resultKeys of stream) {
        keys = keys.concat(resultKeys);
        if (keys.length > 100) {
          await this.redis.del(...keys);
          keys = [];
        }
      }
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to clear namespace: ${errorMsg}`);
      throw new Error('Cache clear operation failed');
    }
  }

  async getWithFallback<T>(
    key: string,
    fallback: () => Promise<T>,
    ttlSeconds: number = this.defaultTTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const result = await fallback();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  async getStats(): Promise<{
    keys: number;
    memory: number;
    namespace: string;
  }> {
    try {
      const info = await this.redis.info('memory');
      const keys = await this.redis.keys(`${this.namespace}*`);

      const memoryUsage = info.match(/used_memory:\d+/)?.[0]?.split(':')[1] || '0';

      return {
        keys: keys.length,
        memory: parseInt(memoryUsage, 10),
        namespace: this.namespace,
      };
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to get cache stats: ${errorMsg}`);
      return {
        keys: 0,
        memory: 0,
        namespace: this.namespace,
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      this.logger.error(`Failed to disconnect from Redis: ${errorMsg}`);
    }
  }

  private getNamespacedKey(key: string): string {
    if (!key || typeof key !== 'string' || key.length > 256) {
      throw new Error(`Invalid cache key: ${key}`);
    }
    return `${this.namespace}${key}`;
  }
}