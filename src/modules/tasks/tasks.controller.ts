import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, NotFoundException, UseFilters } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { BatchTasksDto } from './dto/batch-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { TaskFilterDto } from './dto/task-filter.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { HttpResponse } from '../../../src/types/http-response.interface';
import { PaginatedResponse } from '../../../src/types/pagination.interface';
import { TaskStatisticsDto } from './dto/task-statistics.dto';

@ApiTags('tasks')
@Controller('tasks')
@UseFilters(HttpExceptionFilter)
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RateLimit({ limit: 10, windowMs: 60000 }) // Limit to 10 task creations per minute
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully', type: TaskResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: UserResponseDto): Promise<HttpResponse<TaskResponseDto>> {
    const task = await this.tasksService.create(createTaskDto, user);

    return {
      success: true,
      data: task,
      message: 'Task created successfully',
    };

  }

  @Get()
  @RateLimit({ limit: 30, windowMs: 60000 }) // Limit to 30 task fetches per minute
  @ApiOperation({ summary: 'Find all tasks with optional filtering & cursor pagination' })
  @ApiQuery({ name: 'status', enum: TaskStatus, required: false, description: 'Filter by task status' })
  @ApiQuery({ name: 'priority', enum: TaskPriority, required: false, description: 'Filter by task priority' })
  @ApiQuery({ name: 'userId', type: String, required: false, description: 'Filter by owner/user id' })
  @ApiQuery({ name: 'search', type: String, required: false, description: 'Text search across title/description' })
  @ApiQuery({ name: 'createdFrom', type: String, required: false, description: 'Created at (from) - ISO8601' })
  @ApiQuery({ name: 'createdTo', type: String, required: false, description: 'Created at (to) - ISO8601' })
  @ApiQuery({ name: 'dueDateFrom', type: String, required: false, description: 'Due date (from) - ISO8601' })
  @ApiQuery({ name: 'dueDateTo', type: String, required: false, description: 'Due date (to) - ISO8601' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Number of tasks to return per page (default 10, max 100)', example: 10 })
  @ApiQuery({ name: 'cursor', type: String, required: false, description: 'Cursor for pagination (e.g. ISO timestamp or opaque token)' })
  @ApiQuery({ name: 'page', type: Number, required: false, description: 'Page number (1-based) - legacy support', example: 1 })
  @ApiResponse({ status: 200, description: 'List of tasks', type: [TaskResponseDto] })
  @ApiResponse({ status: 404, description: 'No tasks found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findAll(
    @CurrentUser() user: UserResponseDto,
    @Query() filter: TaskFilterDto): Promise<HttpResponse<PaginatedResponse<TaskResponseDto>>> {
    // Service handles DB-level filtering & cursor pagination
    const tasks = await this.tasksService.findAll(
      user.id,
      user.role,
      {
      limit: filter.limit,
      cursor: filter.cursor,
      status: filter.status,
      priority: filter.priority,
      page: filter.page,
      search: filter.search,
      createdFrom: filter.createdFrom,
      createdTo: filter.createdTo,
      dueDateFrom: filter.dueDateFrom,
      dueDateTo: filter.dueDateTo,
    });


    return {
      success: true,
      data: tasks,
      message: 'Tasks retrieved successfully',
    };
    
  }

  @Get('stats')
  @RateLimit({ limit: 30, windowMs: 60000 }) // Limit to 30 stats fetches per minute
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiResponse({ status: 200, description: 'Task statistics retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiResponse({ status: 404, description: 'No tasks found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  @ApiResponse({ status: 502, description: 'Bad gateway' })
  @ApiResponse({ status: 501, description: 'Not implemented' })
  @ApiResponse({ status: 408, description: 'Request timeout' })
  @ApiResponse({ status: 422, description: 'Unprocessable entity' })
  @ApiResponse({ status: 200, description: 'Task statistics retrieved successfully', type: TaskStatisticsDto })
  async getStats(@CurrentUser() user: UserResponseDto): Promise<HttpResponse<TaskStatisticsDto>> {
    
    const getStats = await this.tasksService.getStats(user.id);
    return {
      success: true,
      data: getStats,
      message: 'Task statistics retrieved successfully',
    };
  }

  @Get(':id')
  @RateLimit({ limit: 60, windowMs: 60000 }) // Limit to 60 task fetches per minute
  @ApiOperation({ summary: 'Find a task by ID' })
  @ApiResponse({ status: 200, description: 'Task found', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findOne(@Param('id') id: string, @CurrentUser() user: UserResponseDto): Promise<HttpResponse<TaskResponseDto>> {
    // tasksService.findOne will throw NotFoundException internally
    const task = await this.tasksService.findOne(id, user.id);
    return {
      success: true,
      data: task,
      message: 'Task retrieved successfully',
    };
  }

  @Patch(':id')
  @RateLimit({ limit: 20, windowMs: 60000 }) // Limit to 20 task updates per minute
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully', type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @CurrentUser() user: UserResponseDto): Promise<HttpResponse<TaskResponseDto>> {
    const result = await this.tasksService.update(id, updateTaskDto, user.id);

    return {
      success: true,
      data: result,
      message: 'Task updated successfully',
    };
  }

  @Delete(':id')
  @RateLimit({ limit: 15, windowMs: 60000 }) // Limit to 15 task deletions per minute
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async remove(@Param('id') id: string, @CurrentUser() user: UserResponseDto): Promise<HttpResponse<void>> {
    const result = await this.tasksService.remove(id, user.id);
    return {
      success: true,
      message: 'Task deleted successfully',
    };
  }

  @Post('batch')
  @RateLimit({ limit: 50, windowMs: 60000 }) // Limit to 50 batch operations per minute
  @ApiResponse({ status: 200, description: 'Batch operation completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() batchDto: BatchTasksDto): Promise<HttpResponse<any>> {
    // service executes bulk/transactional operation and returns a summarized result
    const result = await this.tasksService.batchProcess(batchDto);
    return {
      success: true,
      data: result,
      message: 'Batch operation completed successfully',
    };
  }
} 