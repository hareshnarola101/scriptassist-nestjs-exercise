import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, tryCatch } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
  ) { }

  // TODO: Implement the overdue tasks checker
  // This method should run every hour and check for overdue tasks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks(): Promise<void> {
    const now = new Date();
    this.logger.debug(`Running overdue tasks check at ${now.toISOString()}`);

    try {
      // Find overdue tasks in pending state
      const overdueTasks = await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
        select: ['id', 'title', 'userId', 'dueDate'],
      });

      if (overdueTasks.length === 0) {
        this.logger.log('No overdue tasks found');
        return;
      }

      // Bulk add tasks to queue
      const jobs = overdueTasks.map(task => ({
        name: 'processOverdueTask',
        data: { taskId: task.id },
        opts: { removeOnComplete: true, removeOnFail: 50 }, // cleanup old jobs
      }));

      await this.taskQueue.addBulk(jobs);
      this.logger.log(`Queued ${overdueTasks.length} overdue tasks for processing`);

    } catch (error) {
      this.logger.error('Failed to check overdue tasks', error);
    } finally {
      this.logger.debug('Overdue tasks check completed');
    }
  }
} 