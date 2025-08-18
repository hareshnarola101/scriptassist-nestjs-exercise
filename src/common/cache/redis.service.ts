import { Injectable, Inject } from '@nestjs/common';
import { createClient } from 'redis';

type RedisClientType = ReturnType<typeof createClient>;

@Injectable()
export class RedisService {
  constructor(
    @Inject('REDIS_CLIENT') 
    private readonly client: RedisClientType
  ) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await fn();
    await this.set(key, JSON.stringify(result), ttl);
    return result;
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.client.expire(key, seconds);
  }

  async setEx(key: string, value: string, ttl: number): Promise<void> {
    await this.client.setEx(key, ttl, value);
  }

  async getTtl(key: string): Promise<number> {
    return this.client.ttl(key);
  }
}