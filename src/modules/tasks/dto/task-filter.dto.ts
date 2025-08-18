import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsISO8601,
} from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class TaskFilterDto {
  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filter by task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority, description: 'Filter by task priority' })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filter by owner/user id' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ type: String, description: 'Text search across title/description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Created at (from) - ISO8601' })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  createdFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Created at (to) - ISO8601' })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  createdTo?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Due date (from) - ISO8601' })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  dueDateFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Due date (to) - ISO8601' })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  dueDateTo?: Date;

  // Cursor-based pagination (preferred)
  @ApiPropertyOptional({ type: String, description: 'Cursor for pagination (e.g. ISO timestamp or opaque token)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  // Legacy page-based pagination (optional; prefer cursor)
  @ApiPropertyOptional({ type: Number, description: 'Page number (1-based) - legacy support' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, description: 'Limit / page size (max 100)' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: ['createdAt', 'dueDate', 'priority'], description: 'Sort by field' })
  @IsOptional()
  @IsIn(['createdAt', 'dueDate', 'priority'])
  sortBy?: 'createdAt' | 'dueDate' | 'priority' = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], description: 'Sort direction' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filter by assignee id' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
