

import { TaskStatus } from '../enums/task-status.enum';

export interface FindAllOptions {
  limit?: number;           // page size
  cursor?: string | null;   // ISO timestamp or id encoded
  status?: TaskStatus | null;
  ownerId?: string | null;
}
