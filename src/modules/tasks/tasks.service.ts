import { Injectable, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { FindAllOptions } from './interfaces/find-all-options.interface';
import { BatchTasksDto, BatchAction } from './dto/batch-tasks.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { HttpResponse } from '../../../src/types/http-response.interface';
import { PaginatedResponse } from '../../../src/types/pagination.interface';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    private readonly dataSource: DataSource, // inject DataSource in module
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<HttpResponse<Task>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Inefficient implementation: creates the task but doesn't use a single transaction
      // for creating and adding to queue, potential for inconsistent state
      const task = this.tasksRepository.create(createTaskDto);
      // use the transaction manager to save
      const saved = await queryRunner.manager.save(Task, task);

      // commit DB changes first
      await queryRunner.commitTransaction();

      // enqueue AFTER commit. If enqueue fails we log and can retry / alert — but DB is consistent.
      try {
        await this.taskQueue.add('task-status-update', {
          taskId: saved.id,
          status: saved.status,
        });
      } catch (qErr) {
        // enqueue failed: log for operator/action (we could push an outbox event instead)
        this.logger.error(`Failed to enqueue task-status-update for task ${saved.id}`, qErr);
        // Optionally persist an outbox event or schedule retry job.
        return {
          success: false,
          error: 'Task created but failed to enqueue status update',
          message: typeof qErr === 'object' && qErr !== null && 'message' in qErr ? (qErr as any).message : 'Unknown error',
        };
      }

      return {
        success: true,
        data: saved,
        message: 'Task created successfully',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create task, rolled back', err);
      return {
        success: false,
        error: 'Failed to create task',
        message: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : 'Unknown error',
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cursor-style pagination with relations loaded in one query.
   * Controller should pass limit & cursor; this returns { items, nextCursor }
   */
  async findAll(filters: TaskFilterDto): Promise<HttpResponse<PaginatedResponse<Task>>> {
    try {
      const qb = this.tasksRepository.createQueryBuilder('task');

      // Status filter
      if (filters.status) {
        qb.andWhere('task.status = :status', { status: filters.status });
      }

      // Priority filter
      if (filters.priority) {
        qb.andWhere('task.priority = :priority', { priority: filters.priority });
      }

      // User filter
      if (filters.userId) {
        qb.andWhere('task.userId = :userId', { userId: filters.userId });
      }

      // Search text filter (title + description)
      if (filters.search) {
        qb.andWhere(
          '(task.title ILIKE :search OR task.description ILIKE :search)',
          { search: `%${filters.search}%` },
        );
      }

      // Date range: createdAt
      if (filters.createdFrom) {
        qb.andWhere('task.createdAt >= :createdFrom', {
          createdFrom: filters.createdFrom,
        });
      }
      if (filters.createdTo) {
        qb.andWhere('task.createdAt <= :createdTo', {
          createdTo: filters.createdTo,
        });
      }

      // Date range: dueDate
      if (filters.dueDateFrom) {
        qb.andWhere('task.dueDate >= :dueDateFrom', {
          dueDateFrom: filters.dueDateFrom,
        });
      }
      if (filters.dueDateTo) {
        qb.andWhere('task.dueDate <= :dueDateTo', {
          dueDateTo: filters.dueDateTo,
        });
      }

      // Sorting
      qb.orderBy(`task.${filters.sortBy ?? 'createdAt'}`, filters.sortOrder ?? 'DESC');

      // --- Pagination ---
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;
      const skip = (page - 1) * limit;
      qb.skip(skip).take(limit);

      const [items, total] = await qb.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      const response: PaginatedResponse<Task> = {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };

      return {
        success: true,
        data: response,
        message: 'Tasks retrieved successfully',
      };
    } catch (err) {
      this.logger.error('Failed to retrieve tasks', err);
      return {
        success: false,
        error: 'Failed to retrieve tasks',
        message: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : 'Unknown error',
      };
    }
  }

  /**
   * Single-query find; throws NotFoundException if missing.
   */
  async findOne(id: string): Promise < HttpResponse < Task >> {
      const task = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if(!task) {
        this.logger.warn(`Task with ID ${id} not found`);
        return {
          success: false,
          error: 'Task not found',
          message: `Task with ID ${id} not found`,
        };
      }
    return {
        success: true,
        data: task,
        message: 'Task retrieved successfully',
      };
    }

  /**
   * Update inside a transaction. Only persist changed fields.
   * Enqueue status update after successful commit if status changed.
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise < HttpResponse < Task >> {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const task = await queryRunner.manager.findOne(Task, {
          where: { id },
        });

        if(!task) {
          throw new NotFoundException(`Task with ID ${id} not found`);
        }

      const originalStatus = task.status;

        // merge only provided fields
        if(updateTaskDto.title !== undefined) task.title = updateTaskDto.title;
        if(updateTaskDto.description !== undefined) task.description = updateTaskDto.description;
        if(updateTaskDto.status !== undefined) task.status = updateTaskDto.status as TaskStatus;
        if(updateTaskDto.priority !== undefined) task.priority = updateTaskDto.priority;
        if(updateTaskDto.dueDate !== undefined) task.dueDate = updateTaskDto.dueDate;

        const updated = await queryRunner.manager.save(Task, task);
        await queryRunner.commitTransaction();

        // enqueue after commit if status changed
        if(originalStatus !== updated.status) {
      try {
        await this.taskQueue.add('task-status-update', {
          taskId: updated.id,
          status: updated.status,
        });
      } catch (qErr) {
        this.logger.error(`Failed to enqueue status update for task ${updated.id}`, qErr);
        return {
          success: false,
          error: 'Task updated but failed to enqueue status update',
          message: typeof qErr === 'object' && qErr !== null && 'message' in qErr ? (qErr as any).message : 'Unknown error',
        };
      }
    }

    // reload with relations
    const reloaded = await this.tasksRepository.findOneOrFail({ where: { id: updated.id }, relations: ['user'] });
    return {
      success: true,
      data: reloaded,
      message: 'Task updated successfully',
    };
  } catch(err) {
    await queryRunner.rollbackTransaction();
    this.logger.error(`Failed to update task ${id} - rolled back`, err);
    return {
      success: false,
      error: 'Failed to update task',
      message: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : 'Unknown error',
    };
  } finally {
    await queryRunner.release();
  }
  }

  /**
   * Remove using transaction. Consider converting to soft-delete if you need audit/history.
   */
  async remove(id: string): Promise<HttpResponse<Task[]>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await queryRunner.manager.findOne(Task, { where: { id } });
      if (!task) {
        this.logger.warn(`Task with ID ${id} not found for removal`);
        return {
          success: false,
          error: 'Task not found',
          message: `Task with ID ${id} not found`,
        };
      }
      // Use queryRunner to remove task
      await queryRunner.manager.remove(Task, task);
      await queryRunner.commitTransaction();
      return {
        success: true,
        data: [],
        message: 'Task removed successfully',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to remove task ${id}`, err);
      return {
        success: false,
        error: 'Failed to remove task',
        message: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : 'Unknown error',
      };
    } finally {
      await queryRunner.release();
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
  async updateStatus(id: string, status: string): Promise<HttpResponse<Task>> {
    // Option A: do partial update + fetch to return latest
    await this.tasksRepository.update({ id }, { status: status as TaskStatus });
    const updated = await this.findOne(id);
    return updated;
  }

  async getStats(): Promise<HttpResponse<{ total: number; byStatus: Record<string, number>; byPriority: Record<string, number> }>> {
    // Single DB query using QueryBuilder and conditional aggregates
    const qb = this.tasksRepository.createQueryBuilder('task');
    const total = await qb.getCount();

    const counts = await this.tasksRepository.createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany();

    const priorityCounts = await this.tasksRepository.createQueryBuilder('task')
      .select('task.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.priority')
      .getRawMany();

    // Map raw results into structured object
    const byStatus = counts.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count, 10) }), {});
    const byPriority = priorityCounts.reduce((acc, row) => ({ ...acc, [row.priority]: parseInt(row.count, 10) }), {});

    return {
      success: true,
      data: {
        total,
        byStatus,
        byPriority,
      },
      message: 'Task statistics retrieved successfully',
    };
  }

  async batchProcess(dto: BatchTasksDto): Promise<HttpResponse<{ updated?: number; deleted?: number }>> {
    const { tasks: ids, action } = dto;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (action === BatchAction.COMPLETE) {
        const res = await queryRunner.manager.createQueryBuilder()
          .update(Task)
          .set({ status: TaskStatus.COMPLETED })
          .where('id IN (:...ids)', { ids })
          .execute();
        await queryRunner.commitTransaction();
        return {
          success: true,
          data: { updated: res.affected ?? 0 },
          message: 'Tasks marked as completed successfully',
        };
      }
      if (action === BatchAction.DELETE) {
        const res = await queryRunner.manager.createQueryBuilder()
          .delete()
          .from(Task)
          .where('id IN (:...ids)', { ids })
          .execute();
        await queryRunner.commitTransaction();
        return {
          success: true,
          data: { deleted: res.affected ?? 0 },
          message: 'Tasks deleted successfully',
        };
      }
      // Unsupported action
      return {
        success: false,
        error: 'Unsupported batch action',
        message: `Action ${action} is not supported`,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to batch process tasks`, err);
      return {
        success: false,
        error: 'Failed to batch process tasks',
        message: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : 'Unknown error',
      };
    } finally {
      await queryRunner.release();
    }
  }
}
