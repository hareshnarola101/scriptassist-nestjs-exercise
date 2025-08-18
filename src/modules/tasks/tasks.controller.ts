import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, NotFoundException, UseFilters } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { BatchTasksDto } from './dto/batch-tasks.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { TaskFilterDto } from './dto/task-filter.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

@ApiTags('tasks')
@Controller('tasks')
@UseFilters(HttpExceptionFilter)
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ points: 100, duration: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto) {
    const created = await this.tasksService.create(createTaskDto);
    return created;
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering & cursor pagination' })
  async findAll(@Query() filter: TaskFilterDto) {
    // Service handles DB-level filtering & cursor pagination
    const response = await this.tasksService.findAll({
      limit: filter.limit,
      cursor: filter.cursor,
      status: filter.status,
      priority: filter.priority,
      userId: filter.userId,
      page: filter.page, // optional if you still support page-based
    });

    return response;
    
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    // Delegated to service which runs DB aggregations
    const result = await this.tasksService.getStats();
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    // tasksService.findOne will throw NotFoundException internally
    const result = await this.tasksService.findOne(id);
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    const result = await this.tasksService.update(id, updateTaskDto);
    return result;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string) {
    const result = await this.tasksService.remove(id);
    return result;
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() batchDto: BatchTasksDto) {
    // service executes bulk/transactional operation and returns a summarized result
    const result = await this.tasksService.batchProcess(batchDto);
    return result;
  }
} 