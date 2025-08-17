import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './modules/users/users.module';
import { ThrottlerStorageRedisService } from './common/services/throttler-storage-redis.service';
import Redis from 'ioredis';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    
    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
    
    // Scheduling
    ScheduleModule.forRoot(),
    
    // Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        store: 'redis',
        host: config.get<string>('REDIS_HOST'),
        port: config.get<number>('REDIS_PORT'),
        ttl: config.get<number>('CACHE_TTL') || 60, // default 60s
        max: config.get<number>('CACHE_MAX') || 1000, // default max items
      }),
    }),
    
    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ([
        {
          ttl: configService.get<number>('THROTTLE_TTL') || 60, // default 60s
          limit: configService.get<number>('THROTTLE_LIMIT') || 10, // default 10 requests
          storage: new ThrottlerStorageRedisService(
          new Redis({
            host: configService.get('REDIS_HOST'),
            port: configService.get('REDIS_PORT'),
          })
        ),
        },
      ]),
    }),
    
    // Feature modules
    UsersModule,
    TasksModule,
    AuthModule,
    
    // Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard, // Global rate limit guard
    },
  ],
})
export class AppModule {} 