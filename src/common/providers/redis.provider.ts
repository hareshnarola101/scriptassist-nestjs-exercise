import Redis from 'ioredis';

export const redisProvider = {
  provide: 'REDIS',
  useFactory: () => {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const client = new Redis(url, {
      // optional settings for reliability
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });
    return client;
  },
};