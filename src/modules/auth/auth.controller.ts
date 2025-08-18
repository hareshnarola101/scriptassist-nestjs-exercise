import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, UseFilters } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import type { Request } from 'express';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { ApiTags } from '@nestjs/swagger';
import { LogOutDto } from './dto/logout.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
@UseFilters(HttpExceptionFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshDto: RefreshDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(refreshDto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: UserResponseDto,
    @Req() request: Request,
    @Body() logoutDto: LogOutDto
  ): Promise<void> {
    const authHeader = request.header('authorization');
    const token = authHeader?.split(' ')[1];
    
    if (token) {
      await this.authService.logout(user.id, token, logoutDto.deviceId);
    }
  }
} 