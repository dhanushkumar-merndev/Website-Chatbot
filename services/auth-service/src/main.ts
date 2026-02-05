import { otrun } from './tracing';
otrun.start();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from '@mguay/nestjs-better-auth';
import { winstonLoggerConfig } from './common/logger.config';
import { AppModule } from './app.module';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Env } from './types/env.types';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLoggerConfig,
  });
  const configService = app.get<ConfigService<Env>>(ConfigService);
  const authService = app.get<AuthService>(AuthService);
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // 🛡️ Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ✅ Middleware must parse body BEFORE Better Auth handlers
  app.use(require('express').json());
  app.use(require('express').urlencoded({ extended: true }));

  const allowedOrigins = configService
    .get<string>('ALLOWED_ORIGINS')
    ?.split(',') || ['http://localhost:3000'];

  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.includes('localhost:3000')
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Accept, Authorization, Cookie, Cache-Control, Pragma',
    exposedHeaders: 'Set-Cookie',
  });

  // ✅ Better Auth Integration Middleware
  app.use(async (req: any, res: any, next: any) => {
    // Better Auth handles routes under /api/auth
    // but we skip our custom bridge endpoints (_sync, logout, check-provider)
    if (
      req.path.startsWith('/api/auth') &&
      !/(_sync|logout|check-provider)/.test(req.path)
    ) {
      const startTime = Date.now();
      try {
        const handler = toNodeHandler(authService.instance.handler);
        await handler(req, res);
      } catch (err) {
        console.error(
          `[ERROR] BetterAuth handler failed for ${req.path}:`,
          err,
        );
        if (!res.headersSent) {
          return res.status(500).json({ error: 'Internal server error' });
        }
      }

      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(
          `[PERF_WARNING] BetterAuth handler for ${req.path} took ${duration}ms`,
        );
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
