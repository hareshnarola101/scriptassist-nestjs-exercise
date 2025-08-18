import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
@Processor('task-processing', {
  concurrency: 5, // Process up to 5 jobs in parallel
  limiter: {
    max: 100, // Max 100 jobs per second
    duration: 1000,
  },
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  private readonly RETRY_LIMIT = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      // Validate job data before processing
      this.validateJobData(job);

      // Process based on job type
      switch (job.name) {
        case 'task-status-update':
          return await this.processWithRetry(
            job,
            this.handleStatusUpdate.bind(this)
          );
        
        case 'overdue-tasks-notification':
          return await this.processBatchOverdueTasks(job);
          
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.handleProcessingError(job, error);
      throw error; // Let BullMQ handle retries based on our configuration
    }
  }

  private async processWithRetry(
    job: Job,
    handler: (job: Job) => Promise<any>,
    attempt = 1
  ): Promise<any> {
    try {
      return await handler(job);
    } catch (error) {
      if (attempt >= this.RETRY_LIMIT) {
        this.logger.error(
          `Max retries (${this.RETRY_LIMIT}) exceeded for job ${job.id}`,
          error instanceof Error ? error.stack : error
        );
        throw error;
      }

      this.logger.warn(
        `Retrying job ${job.id} (attempt ${attempt + 1}/${this.RETRY_LIMIT})`
      );
      await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      return this.processWithRetry(job, handler, attempt + 1);
    }
  }

  private async processBatchOverdueTasks(job: Job) {
    const { taskIds } = job.data;
    
    if (!Array.isArray(taskIds)) {
      throw new Error('Invalid taskIds format - expected array');
    }

    const BATCH_SIZE = 50;
    const results = [];

    for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
      const batch = taskIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(taskId => 
          this.tasksService.updateStatus(taskId, TaskStatus.OVERDUE)
        )
      );
      
      results.push(...batchResults);
      this.logger.debug(`Processed batch ${i}-${i + batch.length}`);
    }

    return {
      success: true,
      processedCount: results.filter(r => r.status === 'fulfilled').length,
      failedCount: results.filter(r => r.status === 'rejected').length,
    };
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    
    // Validate status value
    if (!Object.values(TaskStatus).includes(status)) {
      throw new Error(`Invalid status value: ${status}`);
    }

    const task = await this.tasksService.updateStatus(taskId, status);
    
    return { 
      success: true,
      taskId: task.id,
      newStatus: task.status,
      processedAt: new Date().toISOString(),
    };
  }

  private validateJobData(job: Job) {
    if (!job.data) {
      throw new Error('Missing job data');
    }

    if (job.name === 'task-status-update') {
      if (!job.data.taskId || !job.data.status) {
        throw new Error('Missing required fields: taskId or status');
      }
    }

    if (job.name === 'overdue-tasks-notification') {
      if (!job.data.taskIds) {
        throw new Error('Missing required field: taskIds');
      }
    }
  }

  private handleProcessingError(job: Job, error: unknown) {
    this.logger.error(
      `Failed to process job ${job.id}`,
      error instanceof Error ? error.stack : error
    );
    
    // Here you could:
    // 1. Send alert to monitoring system
    // 2. Update job status in database
    // 3. Trigger fallback logic
  }
}