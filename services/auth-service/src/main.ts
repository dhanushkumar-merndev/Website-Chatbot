import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from '@mguay/nestjs-better-auth';
import { winstonLoggerConfig } from './common/logger.config';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './redis/redis.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLoggerConfig,
  });
  const configService = app.get(ConfigService);
  const authService = app.get<AuthService>(AuthService);

  // 🛡️ Security Headers (relaxed slightly for easier local dev debugging)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));

  // ✅ Middleware must parse body BEFORE Better Auth handlers
  app.use(require('express').json());
  app.use(require('express').urlencoded({ extended: true }));

  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS')?.split(',') || ['http://localhost:3000'];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost:3000')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Cookie, Cache-Control, Pragma',
    exposedHeaders: 'Set-Cookie',
  });

  // ✅ Better Auth Integration Middleware
  app.use(async (req: any, res: any, next: any) => {
    // Better Auth handles routes under /api/auth
    // but we skip our custom bridge endpoints (_sync, logout, check-provider)
    if (req.path.startsWith('/api/auth') && !/(_sync|logout|check-provider)/.test(req.path)) {
      
      // --- REDIS CACHE LOGIC START ---
      const redis = app.get<any>(REDIS_CLIENT); // Ensure we get the Redis client
      let cacheKey: string | null = null;
      let shouldCache = false;

      if (req.method === 'GET' && req.path.endsWith('/get-session')) {
         const cookie = req.headers.cookie;
         const token = cookie?.split('; ')
          .find((row : string) => row.startsWith('better-auth.session_token='))
          ?.split('=')[1];

         if (token) {
            cacheKey = `session_cache:${token}`;
            try {
                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    console.log(`[AUTH] [CACHE_HIT] Serving session from Redis for ...${token.slice(-10)}`);
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('X-Cache', 'HIT');
                    return res.send(cachedData); 
                }
                console.log(`[AUTH] [CACHE_MISS] Fetching session for ...${token.slice(-10)}`);
                shouldCache = true;
            } catch (e) {
                console.error('[AUTH] [CACHE_ERROR] Redis get failed:', e);
            }
         }
      }
      // --- REDIS CACHE LOGIC END ---

      // Intercept Response if we need to cache
      // Intercept Response if we need to cache
      if (shouldCache && cacheKey) {
          const originalSend = res.send;
          const originalWrite = res.write;
          const originalEnd = res.end;
          
          const chunks: any[] = [];

          res.write = function (chunk: any, ...args: any[]) {
              if (chunk) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              return originalWrite.apply(res, [chunk, ...args]);
          };

          res.end = function (chunk: any, ...args: any[]) {
              if (chunk) {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              
              if (res.statusCode === 200 && chunks.length > 0) {
                  try {
                      const bodyBuffer = Buffer.concat(chunks);
                      const responseBody = bodyBuffer.toString('utf8');
                      
                      // Verify it's JSON before caching
                      JSON.parse(responseBody);
                      
                      // Async background set
                      redis.set(cacheKey, responseBody, 'EX', 3600).then(() => {
                           console.log(`[AUTH] [CACHE_SET] Cached session in Redis: ${responseBody.substring(0, 50)}...`);
                      }).catch((err: any) => console.error('[AUTH] [CACHE_ERROR] Set failed:', err));
                  } catch (e) {
                      console.error('[AUTH] [CACHE_ERROR] Failed to process/cache response:', e);
                  }
              }

              return originalEnd.apply(res, [chunk, ...args]);
          };
      }

      const startTime = Date.now();
      try {
        const handler = toNodeHandler(authService.instance.handler);
        await handler(req, res);
      } catch (err) {
        console.error(`[ERROR] BetterAuth handler failed for ${req.path}:`, err);
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Internal server error' });
        }
      }
      
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[PERF_WARNING] BetterAuth handler for ${req.path} took ${duration}ms`);
      }
      return;
    }
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`Auth service running on http://localhost:${port}`);
}
bootstrap();
