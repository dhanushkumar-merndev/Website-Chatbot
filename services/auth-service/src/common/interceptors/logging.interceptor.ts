import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Response } from 'express';
import { AuthenticatedRequest } from 'src/types/auth-request';

@Injectable()
export class LoggingInterceptor<T = unknown>
  implements NestInterceptor<T, T>
{
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<AuthenticatedRequest>();
    const response = httpCtx.getResponse<Response>();

    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const statusCode = response.statusCode;
          const duration = Date.now() - start;

          const userEmail =
            request.user?.email ??
            (data as any)?.user?.email ??
            'anonymous';

          const provider =
            request.provider ??
            (data as any)?.session?.provider ??
            'unknown';

          let message = `${method} ${url} ${statusCode} - ${duration}ms`;

          if (!url.includes('/logout')) {
            message += ` [user: ${userEmail}] [provider: ${provider}]`;
          }

          this.logger.log(message);
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;

          const statusCode =
            err instanceof HttpException
              ? err.getStatus()
              : 500;

          const userEmail =
            request.user?.email ?? 'anonymous';

          this.logger.error(
            `${method} ${url} ${statusCode} - ${duration}ms [user: ${userEmail}]`,
            err instanceof Error ? err.stack : undefined,
          );
        },
      }),
    );
  }
}
