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

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
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
      }

      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create task, rolled back', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cursor-style pagination with relations loaded in one query.
   * Controller should pass limit & cursor; this returns { items, nextCursor }
   */
  async findAll(opts: FindAllOptions = {}): Promise<{ items: Task[]; nextCursor: string | null; count: number }> {
    // Inefficient implementation: retrieves all tasks without pagination
    // and loads all relations, causing potential performance issues
    const limit = Math.min(opts.limit ?? 10, 100);
    const qb = this.tasksRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user') // load user relation efficiently
      .orderBy('task.createdAt', 'DESC')      // ensure deterministic ordering
      .take(limit + 1);

    if (opts.status) {
      qb.andWhere('task.status = :status', { status: opts.status });
    }
    if (opts.priority) {
      qb.andWhere('task.priority = :priority', { priority: opts.priority });
    }
    if (opts.user_id) {
      qb.andWhere('task.user_id = :user_id', { user_id: opts.user_id });
    }

    if (opts.cursor) {
      // cursor assumed to be an ISO timestamp string (or change to base64 encoding)
      qb.andWhere('task.createdAt < :cursor', { cursor: opts.cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor, count: items.length };
  }

  /**
   * Single-query find; throws NotFoundException if missing.
   */
  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  /**
   * Update inside a transaction. Only persist changed fields.
   * Enqueue status update after successful commit if status changed.
   */
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // merge only provided fields
      if (updateTaskDto.title !== undefined) task.title = updateTaskDto.title;
      if (updateTaskDto.description !== undefined) task.description = updateTaskDto.description;
      if (updateTaskDto.status !== undefined) task.status = updateTaskDto.status as TaskStatus;
      if (updateTaskDto.priority !== undefined) task.priority = updateTaskDto.priority;
      if (updateTaskDto.dueDate !== undefined) task.dueDate = updateTaskDto.dueDate;

      const updated = await queryRunner.manager.save(Task, task);
      await queryRunner.commitTransaction();

      // enqueue after commit if status changed
      if (originalStatus !== updated.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updated.id,
            status: updated.status,
          });
        } catch (qErr) {
          this.logger.error(`Failed to enqueue status update for task ${updated.id}`, qErr);
        }
      }

      // reload with relations
      return this.tasksRepository.findOneOrFail({ where: { id: updated.id }, relations: ['user'] });
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update task ${id} - rolled back`, err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Remove using transaction. Consider converting to soft-delete if you need audit/history.
   */
  async remove(id: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const task = await queryRunner.manager.findOne(Task, { where: { id } });
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      // Use queryRunner to remove task
      await queryRunner.manager.remove(Task, task);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to remove task ${id}`, err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Parameterized, safe status lookup. Avoid raw SQL.
   */
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository.createQueryBuilder('task')
      .where('task.status = :status', { status })
      .leftJoinAndSelect('task.user', 'user')
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Update status called by job processors: keep it small and idempotent.
   */
  async updateStatus(id: string, status: string): Promise<Task> {
    // Option A: do partial update + fetch to return latest
    await this.tasksRepository.update({ id }, { status: status as TaskStatus });
    const updated = await this.findOne(id);
    return updated;
  }

  async getStats(): Promise<{ total: number; byStatus: Record<string, number>; byPriority: Record<string, number> }> {
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
      total,
      byStatus,
      byPriority,
    };
  }

  async batchProcess(dto: BatchTasksDto) {
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
        return { updated: res.affected ?? 0 };
      }
      if (action === BatchAction.DELETE) {
        const res = await queryRunner.manager.createQueryBuilder()
          .delete()
          .from(Task)
          .where('id IN (:...ids)', { ids })
          .execute();
        await queryRunner.commitTransaction();
        return { deleted: res.affected ?? 0 };
      }
      throw new HttpException('Unsupported action', HttpStatus.BAD_REQUEST);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
