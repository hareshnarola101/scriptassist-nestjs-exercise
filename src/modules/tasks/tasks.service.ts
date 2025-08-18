import { Injectable, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, SelectQueryBuilder } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { BatchTasksDto, BatchAction } from './dto/batch-tasks.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { HttpResponse } from '../../../src/types/http-response.interface';
import { PaginatedResponse } from '../../../src/types/pagination.interface';
import { UserResponseDto } from '@modules/users/dto/user-response.dto';
import { RedisService } from '@common/cache/redis.service';
import { TaskResponseDto } from './dto/task-response.dto';
import { TaskMapper } from './mappers/task.mapper';
import { TaskStatisticsDto } from './dto/task-statistics.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    private readonly dataSource: DataSource, // inject DataSource in module
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
    private readonly redisService: RedisService,
  ) {}

  // -----------------------
  // Common Helpers
  // -----------------------

  private formatErrorResponse(error: unknown, fallbackMsg: string): HttpResponse<never> {
    const message = error && typeof error === 'object' && 'message' in error
      ? (error as any).message
      : 'Unknown error';
    return { success: false, error: fallbackMsg, message };
  }

  private async runInTransaction<T>(cb: (qr: QueryRunner) => Promise<T>): Promise<T> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await cb(qr);
      await qr.commitTransaction();
      return result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async enqueueTaskStatusUpdate(taskId: string, status: TaskStatus): Promise<void> {
    try {
      await this.taskQueue.add('task-status-update', { taskId, status });
    } catch (err) {
      this.logger.error(`Failed to enqueue status update for task ${taskId}`, err);
      throw new Error('Failed to enqueue status update');
    }
  }

  // -----------------------
  // Core Methods
  // -----------------------

  async create(createTaskDto: CreateTaskDto, user: UserResponseDto): Promise<TaskResponseDto> {

    try {
      const saved = await this.runInTransaction(async (qr) => {
        const task = this.tasksRepository.create({
          ...createTaskDto,
          userId: user.id
        });
        return qr.manager.save(Task, task);
      });

      // enqueue AFTER commit. If enqueue fails we log and can retry / alert — but DB is consistent.
      try {
        await this.enqueueTaskStatusUpdate(saved.id, saved.status);
      } catch (queueErr) {
        // enqueue failed: log for operator/action (we could push an outbox event instead)
        this.logger.error(`Failed to enqueue status update for task ${saved.id}`, queueErr);
        throw new HttpException('Failed to enqueue status update', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return TaskMapper.toDto(saved);
    } catch (err) {
      this.logger.error('Failed to create task', err);
      throw new HttpException('Task creation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Cursor-style pagination with relations loaded in one query.
   * Controller should pass limit & cursor; this returns { items, nextCursor }
   */
  async findAll(userId: string, filters: TaskFilterDto): Promise<PaginatedResponse<TaskResponseDto>> {
    try {
      const qb = this.tasksRepository.createQueryBuilder('task');

      this.applyFilters(qb, filters, userId);

      // Sorting
      qb.orderBy(`task.${filters.sortBy ?? 'createdAt'}`, filters.sortOrder ?? 'DESC');

      // --- Pagination ---
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;
      const skip = (page - 1) * limit;
      qb.skip(skip).take(limit);

      const [items, total] = await qb.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      const response: PaginatedResponse<TaskResponseDto> = {
        data: items.map(TaskMapper.toDto),
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };

      return response;
    } catch (err) {
      this.logger.error('Failed to retrieve tasks', err);
      throw new HttpException('Failed to retrieve tasks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private applyFilters(qb: SelectQueryBuilder<Task>, filters: TaskFilterDto, userId: string): void {
    if (filters.status) qb.andWhere('task.status = :status', { status: filters.status });
    if (filters.priority) qb.andWhere('task.priority = :priority', { priority: filters.priority });
    if (userId) qb.andWhere('task.userId = :userId', { userId });
    if (filters.search) {
      qb.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }
    if (filters.createdFrom) qb.andWhere('task.createdAt >= :createdFrom', { createdFrom: filters.createdFrom });
    if (filters.createdTo) qb.andWhere('task.createdAt <= :createdTo', { createdTo: filters.createdTo });
    if (filters.dueDateFrom) qb.andWhere('task.dueDate >= :dueDateFrom', { dueDateFrom: filters.dueDateFrom });
    if (filters.dueDateTo) qb.andWhere('task.dueDate <= :dueDateTo', { dueDateTo: filters.dueDateTo });
  }

  /**
   * Single-query find; throws NotFoundException if missing.
   */
  async findOne(id: string, userId: string): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({
      where: { id, userId },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return TaskMapper.toDto(task);
  }

  /**
   * Update inside a transaction. Only persist changed fields.
   * Enqueue status update after successful commit if status changed.
   */
  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string): Promise<TaskResponseDto> {

    try {
      const updated = await this.runInTransaction(async (qr) => {
        const task = await qr.manager.findOne(Task, { where: { id, userId } });
        if (!task) throw new NotFoundException(`Task with ID ${id} not found`);

        Object.assign(task, updateTaskDto);
        return qr.manager.save(Task, task);
      });

      if (updateTaskDto.status) {
        try {
          await this.enqueueTaskStatusUpdate(updated.id, updated.status);
        } catch (queueErr) {
          this.logger.error(`Failed to enqueue status update for task ${updated.id}`, queueErr);
          throw new HttpException('Failed to enqueue status update', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }

      // reload with relations
      const reloaded = await this.tasksRepository.findOneOrFail({ where: { id: updated.id }, relations: ['user'] });
      return TaskMapper.toDto(reloaded);
    } catch (err) {
      this.logger.error(`Failed to update task ${id}`, err);
      throw new HttpException('Task update failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Remove using transaction. Consider converting to soft-delete if you need audit/history.
   */
  async remove(id: string, userId: string): Promise<void> {
    try {
      await this.runInTransaction(async (repo) => {
        const task = await repo.manager.findOne(Task, { where: { id, userId } });
        if (!task) {
          throw new NotFoundException(`Task with ID ${id} not found`);
        }
        
        await repo.manager.remove(Task, task);

      });
    } catch (err) {
      this.logger.error(`Failed to delete task ${id}`, err);
      throw new HttpException('Task deletion failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Parameterized, safe status lookup. Avoid raw SQL.
   */
  async findByStatus(status: TaskStatus): Promise<HttpResponse<Task[]>> {
    const tasks = await this.tasksRepository.createQueryBuilder('task')
      .where('task.status = :status', { status })
      .leftJoinAndSelect('task.user', 'user')
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return {
      success: true,
      data: tasks,
      message: 'Tasks retrieved successfully',
    };
  }

  /**
   * Update status called by job processors: keep it small and idempotent.
   */
  async updateStatus(id: string, status: TaskStatus): Promise<TaskResponseDto> {
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    task.status = status as TaskStatus;
    const updatedTask = await this.tasksRepository.save(task);
    return TaskMapper.toDto(updatedTask);
  }

  async getStats(userId: string): Promise<TaskStatisticsDto> {

    const cacheKey = `user:${userId}:task_stats`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as TaskStatisticsDto;
    }

    const raw = await this.tasksRepository
      .createQueryBuilder('task')
      .select('COUNT(*)', 'total')
      .addSelect('task.status', 'status')
      .addSelect('task.priority', 'priority')
      .where('task.userId = :userId', { userId })
      .groupBy('task.status')
      .addGroupBy('task.priority')
      .getRawMany();

    // Aggregate into maps
    const total = raw.reduce((acc, row) => acc + parseInt(row.total, 10), 0);
    const byStatus = raw.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + parseInt(row.total, 10);
      return acc;
    }, {});
    const byPriority = raw.reduce((acc, row) => {
      acc[row.priority] = (acc[row.priority] ?? 0) + parseInt(row.total, 10);
      return acc;
    }, {});

    const stats: TaskStatisticsDto = {
      totalTasks: total,
      byStatus,
      byPriority,
    };

    await this.redisService.set(cacheKey, JSON.stringify(stats), 60 * 5); // Cache for 5 minutes
    return stats;
    
  }

  async batchProcess(dto: BatchTasksDto): Promise<{ updated?: number; deleted?: number }> {
    const { tasks: ids, action } = dto;
    try {
      await this.taskQueue.addBulk(
        ids.map(id => ({
          name: 'task-status-update',
          data: { taskId: id, action },
          opts: { removeOnComplete: true, removeOnFail: 50 }, // cleanup old jobs
        }))
      );
      return {
        updated: action === BatchAction.COMPLETE ? ids.length : undefined,
        deleted: action === BatchAction.DELETE ? ids.length : undefined,
      };
    } catch (err) {
      this.logger.error(`Failed to batch process tasks`, err);
      throw new HttpException('Failed to batch process tasks', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getOverdueTasksBatch(
    limit: number,
    cursor?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const query = this.tasksRepository.createQueryBuilder('task')
      .where('task.dueDate < :now', { now: new Date() })
      .andWhere('task.status NOT IN (:...statuses)', {
        statuses: [TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS],
      })
      .orderBy('task.id', 'ASC')
      .take(limit);

    if (cursor) {
      query.andWhere('task.id > :cursor', { cursor });
    }

    const tasks = await query.getMany();
    const nextCursor = tasks.length === limit ? tasks[tasks.length - 1].id : undefined;

    return { tasks, nextCursor };
  }

  async sendOverdueNotification(taskId: string): Promise<void> {
    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: ['user']
    });

    if (!task) {
      this.logger.warn(`Task ${taskId} not found for notification`);
      return;
    }

    // Actual implementation would go here
    this.logger.log(`Sending overdue notification to ${task.user.email} for task "${task.title}"`);
  }
}
