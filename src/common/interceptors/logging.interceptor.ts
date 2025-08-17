import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, ip, user } = req;
    const userId = user?.id || 'anonymous';
    const now = Date.now();

    // Log incoming request (without sensitive body details like password)
    this.logger.log(
      `${method} ${url} | user=${userId} | ip=${ip}`,
    );

    return next.handle().pipe(
      tap((data) => {
        const responseTime = Date.now() - now;

        this.logger.log(
          ` ${method} ${url} | user=${userId} | ${responseTime}ms`,
        );

        // Optional: log response metadata only (not full body to avoid leaking data)
        if (data?.success !== undefined) {
          this.logger.debug(
            `Response meta → success=${data.success} statusCode=${data.statusCode ?? 200}`,
          );
        }
      }),
      catchError((err) => {
        const responseTime = Date.now() - now;
        this.logger.error(
          ` ${method} ${url} | user=${userId} | ${responseTime}ms | Error=${err.message}`,
        );
        throw err;
      }),
    );
  }
}
