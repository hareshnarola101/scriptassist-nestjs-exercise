import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service';
import { TokenService } from '../services/token.service';
import { LoginDto } from '../dto/login.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { RegisterDto } from '../dto/register.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { AUTH_ERRORS } from '../constants/auth.constants';
import { RedisService } from '../../../common/cache/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
  ) {}

  async validateUser(email: string, pass: string): Promise<UserResponseDto> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user || !(await this.usersService.validatePassword(user.id, pass))) {
      await this.redisService.increment(`login:attempts:${email}`);
      await this.redisService.expire(
        `login:attempts:${email}`,
        300, // 5 minutes
      );
      
      const attempts = await this.redisService.get(`login:attempts:${email}`);
      if (parseInt(attempts ?? '0') >= 5) {
        throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_LOCKED);
      }
      
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    return user;
  }

  async login(loginDto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    return this.tokenService.generateTokens(user, loginDto.deviceId);
  }

  async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
    const user = await this.usersService.create(registerDto);
    return this.tokenService.generateTokens(user, registerDto.deviceId);
  }

  async refreshTokens(refreshDto: RefreshDto): Promise<TokenResponseDto> {
    const { refreshToken, deviceId } = refreshDto;
    return this.tokenService.refreshTokens(refreshToken, deviceId);
  }

  async logout(userId: string, accessToken: string, deviceId: string): Promise<void> {
    const decoded = this.jwtService.decode(accessToken) as { exp?: number; jti?: string };
    const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;
    
    if (ttl > 0 && decoded.jti) {
      await this.redisService.setEx(
        `token:blacklisted:${decoded.jti}`,
        '1',
        ttl
      );
    }
    
    await this.tokenService.revokeRefreshTokensForDevice(userId, deviceId);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!token) return true; // Consider missing token as blacklisted
    
    try {
      const decoded = this.jwtService.decode(token) as { jti?: string };
      if (!decoded?.jti) return true;
      
      return !!(await this.redisService.get(
        `token:blacklisted:${decoded.jti}`
      ));
    } catch (e) {
      return true; // Consider invalid tokens as blacklisted
    }
  }
}