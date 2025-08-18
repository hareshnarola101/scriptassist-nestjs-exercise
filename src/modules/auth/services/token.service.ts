import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { AUTH_ERRORS } from '../constants/auth.constants';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenPayload, TokenPayload } from '../interfaces/token-payload.interface';
import { parseDurationToSeconds } from '@common/utils/time.util';
import { UsersService } from '@modules/users/users.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokenRepository: RefreshTokenRepository,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async generateTokens(user: UserResponseDto, deviceId: string): Promise<TokenResponseDto> {
    const tokenId = uuidv4();
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: tokenId,
    };
  
    const accessTokenExpiry = this.configService.get<string>('jwt.accessTokenExpiry', '15m');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: accessTokenExpiry,
      }),
      this.generateRefreshToken(user.id, deviceId),
    ]);
  
    // Convert expiry time to seconds
    const expiresIn = this.parseJwtExpiryToSeconds(accessTokenExpiry);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }
  
  private parseJwtExpiryToSeconds(expiry: string): number {
    return parseDurationToSeconds(expiry, 900);
  }

  

  private async generateRefreshToken(userId: string, deviceId: string): Promise<string> {
    // Revoke any existing refresh tokens for this device
    await this.refreshTokenRepository.revokeForDevice(userId, deviceId);
  
    const expiresAt = new Date();
    const refreshTokenExpiry = this.configService.get<string>('jwt.refreshTokenExpiry', '7d');
    const expirySeconds = parseDurationToSeconds(refreshTokenExpiry, 604800); // 7 days default
    
    expiresAt.setSeconds(expiresAt.getSeconds() + expirySeconds);
  
    const refreshToken = await this.jwtService.signAsync(
      { 
        sub: userId,
        deviceId, // Include deviceId in the payload
      } as RefreshTokenPayload,
      {
        secret: this.configService.get<string>('jwt.refreshTokenSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshTokenExpiry'),
      },
    );

    await this.refreshTokenRepository.save({
      token: refreshToken,
      userId,
      deviceId,
      expiresAt,
      isRevoked: false,
    });
  
    return refreshToken;
  }

  async refreshTokens(refreshToken: string, deviceId: string): Promise<TokenResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshTokenSecret')
      });
    } catch (e) {
      console.log('JWT Verification Error:', e);
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }

    // Check if the token matches the device
    if (payload.deviceId !== deviceId) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }

    // Check if the token exists in the database and is not revoked
    const storedToken = await this.refreshTokenRepository.findValidToken(
      refreshToken,
      payload.sub,
      deviceId
    );

    if (!storedToken) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }

    // Check if the token has expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }

    // Get the user
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }

    // Revoke the old refresh token
    await this.refreshTokenRepository.revokeToken(refreshToken);

    // Generate new tokens
    return this.generateTokens(user, deviceId);
  }

  async revokeRefreshTokensForDevice(userId: string, deviceId: string): Promise<void> {
    await this.refreshTokenRepository.revokeForDevice(userId, deviceId);
  }
}