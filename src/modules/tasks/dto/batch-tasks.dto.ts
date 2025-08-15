import { IsArray, ArrayNotEmpty, IsEnum } from 'class-validator';

export enum BatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
  // add more actions as needed
}

export class BatchTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  tasks: string[]; // array of task IDs

  @IsEnum(BatchAction)
  action: BatchAction;
}
