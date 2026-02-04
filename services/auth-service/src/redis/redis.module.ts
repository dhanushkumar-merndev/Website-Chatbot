import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        let client: Redis;
        
        if (!redisUrl) {
          console.warn('⚠️ REDIS_URL not found, falling back to localhost:6379');
          client = new Redis('redis://localhost:6379');
        } else {
          try {
            // Trim any accidental spaces or hidden characters
            const cleanUrl = redisUrl.trim();
            client = new Redis(cleanUrl);
          } catch (e) {
            console.error('Failed to create Redis client:', e.message);
            client = new Redis('redis://localhost:6379');
          }
        }

        client.on('error', (err) => {
          console.error('[REDIS ERROR]', err.message);
        });

        client.on('connect', () => {
          console.log('🚀 Connected to Redis');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
