import { Global, Module, OnModuleDestroy, Logger } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DATABASE_CONNECTION } from './database-connection';
import * as authSchema from '../auth/schema';
import { MigrationsService } from './migrations.service';
import { getDatabasePool } from './database.pool';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (
        configService: ConfigService,
      ): NodePgDatabase<typeof authSchema> => {
        const logger = new Logger('DatabaseModule');
        const connectionString = configService.getOrThrow<string>('DATABASE_URL');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const isProduction = nodeEnv === 'production';

        const pool = getDatabasePool({
          connectionString,
          isProduction,
          max: configService.get<number>('DB_MAX_CONNECTIONS', 20),
          idleTimeoutMillis: configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
          connectionTimeoutMillis: configService.get<number>('DB_CONNECTION_TIMEOUT_MS', 5000),
        });

        if (!isProduction && global.pgPool) {
          logger.log('♻️ Reusing existing database pool');
        }

        return drizzle(pool, {
          schema: authSchema,
        });
      },
      inject: [ConfigService],
    },
    MigrationsService,
  ],
  exports: [DATABASE_CONNECTION, MigrationsService],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private configService: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    // Only explicitly close pool in production to allow dev hotswaps
    if (nodeEnv === 'production' && global.pgPool) {
      await global.pgPool.end();
    }
  }
}
