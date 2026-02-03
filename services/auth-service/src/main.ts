import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { toNodeHandler } from 'better-auth/node';
import { AuthService } from '@mguay/nestjs-better-auth';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';

import { winstonLoggerConfig } from './common/logger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { 
    bodyParser: false,
    logger: winstonLoggerConfig,
  });
  const configService = app.get(ConfigService);
  const authService = app.get<AuthService>(AuthService);

  app.use(helmet());

  const allowedOrigins =
    configService.get<string>('ALLOWED_ORIGINS')?.split(',') || [
      'http://localhost:3000',
    ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // ✅ Better Auth Middleware
  app.use(async (req: any, res: any, next: any) => {
    if (req.path.startsWith('/api/auth') && !/(_sync|logout|check-provider)/.test(req.path)) {
      const startTime = Date.now();
      const handler = toNodeHandler(authService.instance.handler);
      
      // Wrap in a promise to track timing
      await handler(req, res);
      
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[PERF_WARNING] BetterAuth handler for ${req.path} took ${duration}ms`);
      }
      return;
    }
    next();
  });

  // ✅ Body parsing for Nest routes
  app.use(require('express').json());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = configService.get<number>('PORT') || 4000;
  await app.listen(port, '0.0.0.0');

  console.log(`Auth service running on http://localhost:${port}`);
}

bootstrap();

