import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  // TODO: Implement the overdue tasks checker
  // This method should run every hour and check for overdue tasks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');
    const now = new Date();

    try {
      // Get count first for logging
      const overdueCount = await this.tasksRepository.count({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
      });

      if (overdueCount === 0) {
        this.logger.debug('No overdue tasks found');
        return;
      }

      this.logger.log(`Found ${overdueCount} overdue tasks. Processing...`);

      // Process in batches to avoid memory issues
      for (let i = 0; i < overdueCount; i += this.BATCH_SIZE) {
        const overdueTasks = await this.tasksRepository.find({
          where: {
            dueDate: LessThan(now),
            status: TaskStatus.PENDING,
          },
          take: this.BATCH_SIZE,
          skip: i,
          select: ['id']
        });

        // Extract just the IDs
        const taskIds = overdueTasks.map(task => task.id);

        // Add batch to queue
        await this.taskQueue.add(
          'overdue-tasks-notification',
          { 
            taskIds, // Now passing an array of IDs
            batchNumber: Math.floor(i / this.BATCH_SIZE) + 1,
            totalBatches: Math.ceil(overdueCount / this.BATCH_SIZE)
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          }
        );

        this.logger.debug(`Queued batch ${i / this.BATCH_SIZE + 1} with ${taskIds.length} tasks`);
      }

      this.logger.log(`Successfully queued ${overdueCount} overdue tasks in ${Math.ceil(overdueCount / this.BATCH_SIZE)} batches`);
    } catch (error) {
      this.logger.error(
        'Failed to process overdue tasks',
        error instanceof Error ? error.stack : error
      );
      // Consider adding alerting here
    }
  }
} 