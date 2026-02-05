import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DATABASE_CONNECTION } from './database-connection';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as path from 'path';
import * as authSchema from '../auth/schema';

@Injectable()
export class MigrationsService implements OnModuleInit {
  private readonly logger = new Logger(MigrationsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof authSchema>,
  ) {}

  async onModuleInit(): Promise<void> {
    // ⛔ NEVER run migrations automatically in watch mode
    if (process.env.RUN_MIGRATIONS !== 'true') {
      this.logger.debug('Skipping migrations (RUN_MIGRATIONS not enabled)');
      return;
    }

    this.logger.log('🚀 Running database migrations...');

    try {
      await migrate(this.db, {
        migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
      });

      this.logger.log('✅ Migrations completed successfully.');
    } catch (error) {
      this.logger.error('❌ Migration failed', error);
      throw error; // let Nest fail naturally
    }
  }
}
