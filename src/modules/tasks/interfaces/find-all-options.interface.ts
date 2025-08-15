

import { TaskStatus } from '../enums/task-status.enum';

export interface FindAllOptions {
  limit?: number;           // page size
  cursor?: string | null;   // ISO timestamp or id encoded
  status?: TaskStatus | null;
  priority?: string;
  userId?: string | null;
  page?: number;
}