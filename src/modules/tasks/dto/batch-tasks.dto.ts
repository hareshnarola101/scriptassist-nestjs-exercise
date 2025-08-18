import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsEnum, IsNotEmpty } from 'class-validator';

export enum BatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
  // add more actions as needed
}

export class BatchTasksDto {
  @ApiProperty({
    description: 'Array of task IDs to perform the batch action on',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
  })
  @IsArray()
  @ArrayNotEmpty()
  tasks: string[]; // array of task IDs

  @ApiProperty({
    description: 'Action to perform on the batch of tasks',
    enum: BatchAction,
    example: BatchAction.COMPLETE,
  })
  @IsNotEmpty()
  @IsEnum(BatchAction)
  action: BatchAction;
}
