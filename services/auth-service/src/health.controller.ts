import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';
import { REDIS_CLIENT } from './redis/redis.module';
import Redis from 'ioredis';

import { ConfigService } from '@nestjs/config';

@Controller('api/health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const port = this.configService.get('PORT', 4000);
    const internalUrl = this.configService.get(
      'INTERNAL_API_URL',
      `http://localhost:${port}`,
    );
    const pingUrl = `${internalUrl}/api/health/ping`;

    return this.health.check([
      // Check Redis
      async () => {
        try {
          await this.redis.ping();
          return { redis: { status: 'up' } };
        } catch (e) {
          return { redis: { status: 'down', message: e.message } };
        }
      },
      // Check internal API (self)
      () => this.http.pingCheck('auth-service', pingUrl),
    ]);
  }

  @Get('ping')
  ping() {
    return { status: 'ok' };
  }
}
