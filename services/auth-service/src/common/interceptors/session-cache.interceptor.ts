import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { REDIS_CLIENT } from '../../redis/redis.module';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../types/env.types';

@Injectable()
export class SessionCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SessionCacheInterceptor.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly configService: ConfigService<Env>,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();

    const cachePrefix = this.configService.get('SESSION_CACHE_PREFIX', 'session_cache:');

    // Only cache GET /api/auth/get-session
    if (request.method === 'GET' && request.path.endsWith('/get-session')) {
      const token = this.extractSessionToken(request);

      if (token) {
        const cacheKey = `${cachePrefix}${token}`;

        return new Observable<any>((subscriber) => {
          this.redis
            .get(cacheKey)
            .then((cached) => {
              if (cached) {
                this.logger.log(
                  `[CACHE_HIT] session ...${token.slice(-8)}`,
                );
                response.setHeader('X-Cache', 'HIT');
                subscriber.next(JSON.parse(cached));
                subscriber.complete();
                return;
              }

              this.logger.log(
                `[CACHE_MISS] session ...${token.slice(-8)}`,
              );

              next.handle().pipe(
                tap(async (data) => {
                  if (data) {
                    try {
                      const ttl = this.configService.get('CACHE_TTL_SECONDS', 3600);
                      await this.redis.set(
                        cacheKey,
                        JSON.stringify(data),
                        'EX',
                        ttl,
                      );
                      this.logger.log('[CACHE_SET] session cached');
                    } catch (err) {
                      this.logger.error(
                        '[CACHE_ERROR] Redis set failed',
                        err,
                      );
                    }
                  }
                }),
              ).subscribe(subscriber);
            })
            .catch((err) => {
              this.logger.error(
                '[CACHE_ERROR] Redis get failed',
                err,
              );
              next.handle().subscribe(subscriber);
            });
        });
      }
    }

    return next.handle();
  }

  private extractSessionToken(request: Request): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = Object.fromEntries(
      cookieHeader.split('; ').map((c) => c.split('=')),
    );

    return cookies['better-auth.session_token'] ?? null;
  }
}
