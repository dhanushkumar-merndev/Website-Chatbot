import {
  Global,
  Module,
  Logger,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');

        const redisUrl =
          configService.get<string>('REDIS_URL')?.trim() ??
          'redis://localhost:6379';

        const client = new Redis(redisUrl);

        client.on('connect', () => {
          logger.log('🚀 Connected to Redis');
        });

        client.on('error', (err) => {
          logger.error('[REDIS ERROR]', err);
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    // Optional injection (only for graceful shutdown)
    @Inject(REDIS_CLIENT)
    private readonly redis?: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.logger.log('🔌 Closing Redis connection');
      await this.redis.quit();
    }
  }
}
