import { ApiProperty } from '@nestjs/swagger';

export class TaskStatisticsDto {
    @ApiProperty({
        description: 'Total number of tasks',
        example: 150,
    })
    totalTasks: number;

    @ApiProperty({
        description: 'Tasks grouped by status',
        example: { todo: 100, in_progress: 30, done: 20 },
    })
    byStatus: Record<string, number>;

    @ApiProperty({
        description: 'Tasks grouped by priority',
        example: { low: 50, medium: 70, high: 30 },
    })
    byPriority: Record<string, number>;
}