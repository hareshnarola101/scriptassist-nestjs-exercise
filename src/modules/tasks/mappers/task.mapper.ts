import { Task } from '../entities/task.entity';
import { TaskResponseDto } from '../dto/task-response.dto';
import { CreateTaskDto } from '../dto/create-task.dto';

export class TaskMapper {
  static toDto(task: Task): TaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      userId: task.userId,
    };
  }

  static toEntity(dto: CreateTaskDto, userId: string): Partial<Task> {
    return {
      ...dto,
      userId,
    };
  }
}