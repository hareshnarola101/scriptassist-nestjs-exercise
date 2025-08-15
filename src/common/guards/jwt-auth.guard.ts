import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from '../../modules/users/users.service';

/**
 * JwtAuthGuard
 *
 * - Expects a Bearer token in the Authorization header or a cookie named 'Authentication'.
 * - Verifies JWT using JwtService.
 * - Attaches payload or full user object to request.user.
 *
 * Note:
 * - Ensure JwtModule is configured and provides JwtService (typically in AuthModule).
 * - Optionally, inject your UsersService to load the full user record. If you do,
 *   provide UsersService in the constructor and uncomment the related lines below.
 */

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const token = this.extractTokenFromRequest(req);
    if (!token) {
      throw new UnauthorizedException('Authentication credentials were not provided.');
    }

    let payload: any;
    try {
      // verifyAsync will throw if token is invalid/expired
      payload = await this.jwtService.verifyAsync(token);
    } catch (err) {
      this.logger.debug('JWT verification failed', (err as any)?.message ?? err);
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
    
    if (this.usersService) {
      const user = await this.usersService.findOne(payload.sub || payload.userId || payload.id);
      if (!user) {
        throw new UnauthorizedException('User not found.');
      }
      (req as any).user = user;
      return true;
    }

    // Otherwise attach payload (claims) to request.user
    (req as any).user = payload;
    return true;
  }

  private extractTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers?.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
      }
      // if header contains raw token (rare)
      return authHeader;
    }

    // fallback: cookie
    // ensure you have cookie-parser middleware registered if you want to use cookies
    const cookieToken = (req as any).cookies?.Authentication || (req as any).cookies?.authentication;
    if (cookieToken && typeof cookieToken === 'string') {
      return cookieToken;
    }

    return null;
  }
}
