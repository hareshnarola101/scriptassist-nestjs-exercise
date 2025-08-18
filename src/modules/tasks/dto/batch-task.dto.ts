import { IsArray, ArrayNotEmpty, IsEnum } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { ApiProperty } from '@nestjs/swagger';

export class BatchTasksDto {
    @ApiProperty({ example: ['123e4567-e89b-12d3-a456-426614174000'] })
    @IsArray()
    @ArrayNotEmpty()
    taskIds: string[]; // array of task IDs

    @ApiProperty({ example: 'COMPLETED' })
    @IsEnum(TaskStatus)
    action: TaskStatus;
}