import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { throwError } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second
  private readonly VERY_SLOW_REQUEST_THRESHOLD = 3000; // 3 seconds

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const correlationId = (request as any).correlationId || '-';
    const user = (request as any).user;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const duration = Date.now() - startTime;

        const logContext = {
          method,
          url,
          statusCode,
          duration: `${duration}ms`,
          correlationId,
          ip,
          userId: user?.sub,
          clinicId: user?.clinicId,
          userAgent: userAgent.substring(0, 50),
        };

        // Log level based on status code and duration
        if (statusCode >= 500) {
          this.logger.error(`Server Error: ${JSON.stringify(logContext)}`);
        } else if (statusCode >= 400) {
          this.logger.warn(`Client Error: ${JSON.stringify(logContext)}`);
        } else if (duration >= this.VERY_SLOW_REQUEST_THRESHOLD) {
          this.logger.warn(`VERY SLOW REQUEST: ${JSON.stringify(logContext)}`);
        } else if (duration >= this.SLOW_REQUEST_THRESHOLD) {
          this.logger.warn(`Slow Request: ${JSON.stringify(logContext)}`);
        } else {
          this.logger.log(`${method} ${url} ${statusCode} ${duration}ms`);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const errorContext = {
          method,
          url,
          duration: `${duration}ms`,
          correlationId,
          ip,
          userId: user?.sub,
          clinicId: user?.clinicId,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join(' | '),
        };

        this.logger.error(`Request Failed: ${JSON.stringify(errorContext)}`);
        return throwError(() => error);
      }),
    );
  }
}
