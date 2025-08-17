import { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(private readonly redisClient: Redis) {}

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const results = await this.redisClient
      .multi()
      .incr(key)
      .expire(key, ttl)
      .exec();

    if (!results || !results[0] || results[0][1] == null) {
      throw new Error('Failed to increment or retrieve totalHits from Redis');
    }

    const totalHits = parseInt(results[0][1] as string, 10);
    return {
      totalHits,
      timeToExpire: ttl,
    };
  }
}