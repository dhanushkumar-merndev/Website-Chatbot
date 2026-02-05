import { Pool } from 'pg';

/**
 * Global singleton for the database pool to prevent memory leaks during hot reloads.
 * This pattern is common in development environments like NestJS watch mode or Next.js.
 */
declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

export function getDatabasePool(options: {
  connectionString: string;
  isProduction: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}): Pool {
  if (global.pgPool && !options.isProduction) {
    return global.pgPool;
  }

  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max || 20,
    idleTimeoutMillis: options.idleTimeoutMillis || 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis || 5_000,
    ssl: options.connectionString.includes('neon.tech') ? true : undefined,
  });

  // OpenTelemetry instrumentation can cause MaxListenersExceededWarning
  // if many hot-reloads occur, so we increase the limit.
  pool.setMaxListeners(100);

  if (!options.isProduction) {
    global.pgPool = pool;
  }

  return pool;
}
