import { TaskPriority } from "../enums/task-priority.enum";
import { TaskStatus } from "../enums/task-status.enum";

export interface TaskFilter {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedTo?: string;
    dueDateFrom?: Date;
    dueDateTo?: Date;
    search?: string;
    createdFrom?: Date;
    createdTo?: Date;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'dueDate' | 'priority';
    sortOrder?: 'ASC' | 'DESC';
    cursor?: string; // For cursor-based pagination
    userId?: string; // Filter by user ID
    assigneeId?: string; // Filter by assignee ID
    // Additional fields can be added as needed
}