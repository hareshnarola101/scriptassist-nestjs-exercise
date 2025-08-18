import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from '../interfaces/token-payload.interface';
import { AuthService } from '../services/auth.service';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'refresh-token') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: configService.get('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
      ignoreExpiration: false,
    });
  }

  async validate(request: Request, payload: TokenPayload) {
    const refreshToken = request.body.refreshToken;
    const deviceId = request.body.deviceId;

    // Check if token is blacklisted
    if (await this.authService.isTokenBlacklisted(refreshToken)) {
      throw new UnauthorizedException('Token is blacklisted');
    }

    // Verify the refresh token exists in database
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        token: refreshToken,
        userId: payload.sub,
        deviceId,
        isRevoked: false,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
      deviceId,
    };
  }
}