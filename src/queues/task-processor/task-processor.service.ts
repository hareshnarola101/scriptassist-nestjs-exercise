import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, QueueEvents } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';

class NonRetryableError extends Error {}
class RetryableError extends Error {}

const OVERDUE_TASKS_BATCH_SIZE = 100;
const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

@Injectable()
@Processor('task-processing', {
  concurrency: 5,
})

export class TaskProcessorService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TaskProcessorService.name);
  private queueEvents: QueueEvents;

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  onModuleInit() {
    this.queueEvents = new QueueEvents('task-processing');
    this.queueEvents.on('failed', (args) => {
      this.logger.warn(`Job ${args.jobId} failed. Reason: ${args.failedReason}`);
    });
  }

  /**
   * Entry point for all jobs in the "task-processing" queue.
   * Implements structured logging, retries, and safe job handling.
   */
  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          throw new NonRetryableError('Unknown job type');
      }
    } catch (error) {
      if (error instanceof NonRetryableError) {
        this.logger.error(`Non-retryable error in job ${job.id}: ${error.message}`);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Retryable error in job ${job.id}: ${errorMessage}`);
        throw new RetryableError(errorMessage); // Will trigger retry
      }
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    
    if (!taskId || !status) {
      throw new NonRetryableError('Missing taskId or status');
    }

    if (!TASK_STATUSES.includes(status)) {
      throw new NonRetryableError(`Invalid status: ${status}`);
    }

    try {
      const task = await this.tasksService.updateStatus(taskId, status);
      return { 
        success: true,
        taskId: task.data?.id,
        newStatus: task.data?.status
      };
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RetryableError(`Database update failed: ${errorMessage}`);
    }
  }

  private async handleOverdueTasks(job: Job) {
    let processedCount = 0;
    let cursor: string | undefined;

    do {
      const { tasks, nextCursor } = await this.tasksService.getOverdueTasksBatch(
        OVERDUE_TASKS_BATCH_SIZE,
        cursor
      );

      for (const task of tasks) {
        try {
          await this.tasksService.sendOverdueNotification(task.id);
          processedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed task ${task.id}: ${errorMessage}`);
        }
      }

      cursor = nextCursor;
      await job.updateProgress(Math.floor((processedCount / 100) * 100)); // Percentage-based
    } while (cursor);

    return {
      success: true,
      processedCount
    };
  }
} 