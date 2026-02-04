import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const delay = Date.now() - now;

          // Resolve user: Check request (standard), then response data (bridge sync)
          const userEmail = request.user?.email || data?.user?.email || 'anonymous';
          const provider = request.provider || data?.session?.provider || 'unknown';

          let logMessage = `${method} ${url} ${statusCode} - ${delay}ms`;

          // Omit user details for logout since the session is being cleared
          if (!url.includes('/logout')) {
            logMessage += ` [user: ${userEmail}] [provider: ${provider}]`;
          }

          this.logger.log(logMessage);
        },
        error: (err) => {
          const delay = Date.now() - now;
          const userEmail = request.user?.email || 'anonymous';
          this.logger.error(
            `${method} ${url} ${err.status || 500} - ${delay}ms [user: ${userEmail}]`
          );
        },
      }),
    );
  }
}
