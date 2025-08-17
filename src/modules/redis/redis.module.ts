import { Module, Global } from '@nestjs/common';
import { createClient } from 'redis';

export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: async () => {
        const client = createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379',
        });
        await client.connect();
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
