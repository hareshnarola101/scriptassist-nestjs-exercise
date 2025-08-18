import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { TasksService } from '../tasks.service';
import { TaskStatus } from '../enums/task-status.enum';
import { BatchTasksDto } from '../dto/batch-tasks.dto';

@Processor('task-queue')
@Injectable()
export class TaskProcessor extends WorkerHost {
  constructor(private readonly tasksService: TasksService) {
    super();
  }

  async process(job: Job) {
    try {
      switch (job.name) {
        case 'status-update':
          return this.handleStatusUpdate(job);
        case 'batch-process':
          return this.handleBatchProcess(job);
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job<{ taskId: string; status: TaskStatus }>) {
    const { taskId, status } = job.data;
    return this.tasksService.updateStatus(taskId, status);
  }

  private async handleBatchProcess(job: Job<BatchTasksDto>) {
    return this.tasksService.batchProcess(job.data);
  }
}