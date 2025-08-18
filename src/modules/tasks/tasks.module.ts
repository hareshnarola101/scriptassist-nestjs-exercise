import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../../common/cache/redis.module';
import { UsersModule } from '@modules/users/users.module';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueueAsync({
      name: 'task-processing',
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // Initial delay of 2 seconds
          },
        },
      }),
    }),
    AuthModule,
    RedisModule,
    UsersModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  }],
  exports: [TypeOrmModule, TasksService, BullModule],
})
export class TasksModule { } 