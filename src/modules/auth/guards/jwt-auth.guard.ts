import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TokenExpiredError } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    handleRequest(err: any, user: any, info: any, context: any, status?: any) {
        if (info instanceof TokenExpiredError) {
            throw new UnauthorizedException('Token expired');
        }

        if (err || !user) {
            throw err || new UnauthorizedException('Invalid token');
        }

        return super.handleRequest(err, user, info, context, status);
    }
}
