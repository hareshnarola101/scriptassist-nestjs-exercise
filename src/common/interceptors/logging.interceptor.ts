import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

declare global {
  namespace Express {
    interface User {
      id?: string;
      userId?: string;
      [key: string]: any;
    }
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly sensitiveFields = ['password', 'token', 'authorization'];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const { method, originalUrl, ip, headers, body } = request;
    const userAgent = headers['user-agent'] || '';
    const now = Date.now();

    // Get user ID if available (from JWT or session)
    const userId = this.getUserId(request);

    // Sanitize sensitive data from request body
    const sanitizedBody = this.sanitizeData({ ...body });

    // Log incoming request
    this.logger.log(
      `Incoming Request: 
      Method: ${method} 
      URL: ${originalUrl}
      User ID: ${userId}
      IP: ${ip}
      User Agent: ${userAgent}
      Body: ${JSON.stringify(sanitizedBody)}`
    );

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const responseTime = Date.now() - now;
          const statusCode = response.statusCode;

          // Sanitize sensitive data from response
          const sanitizedResponse = this.sanitizeData(responseBody);

          this.logger.log(
            `Outgoing Response: 
            Method: ${method} 
            URL: ${originalUrl}
            Status: ${statusCode}
            User ID: ${userId}
            Response Time: ${responseTime}ms
            Response: ${JSON.stringify(sanitizedResponse)}`
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `Request Error: 
            Method: ${method} 
            URL: ${originalUrl}
            User ID: ${userId}
            Response Time: ${responseTime}ms
            Error: ${error.message}
            Stack: ${error.stack}`
          );
        },
      }),
    );
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sanitized = { ...data };
    for (const field of this.sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '*****';
      }
    }
    return sanitized;
  }

  private getUserId(request: Request): string {
    if (!request.user) return 'anonymous';
    
    // Check various possible user ID properties
    return request.user.id 
      ?? request.user.userId 
      ?? request.user.sub  // common in JWT
      ?? request.user._id // common in MongoDB
      ?? 'authenticated'; // fallback if user exists but no ID found
  }

}