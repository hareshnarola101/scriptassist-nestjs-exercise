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
        });

        // Add batch to queue
        await this.taskQueue.addBulk(
          overdueTasks.map(task => ({
            name: 'overdue-tasks-notification',
            data: { 
              taskId: task.id,
              dueDate: task.dueDate,
            },
            opts: {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            },
          }))
        );

        this.logger.debug(`Processed batch ${i}-${i + overdueTasks.length}`);
      }

      this.logger.log(`Successfully queued ${overdueCount} overdue tasks`);
    } catch (error) {
      this.logger.error(
        'Failed to process overdue tasks',
        error instanceof Error ? error.stack : error
      );
      // Consider adding alerting here
    }
  }
} 