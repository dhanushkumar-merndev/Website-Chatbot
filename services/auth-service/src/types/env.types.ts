import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  INTERNAL_API_URL: z.string().optional(),
  
  // Database
  DATABASE_URL: z.string().min(1),
  DB_MAX_CONNECTIONS: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_BASE_URL: z.string().min(1),
  SERVICE_JWT_SECRET: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  COOKIE_DOMAIN: z.string().optional(),
  AUTH_SOCIAL_PROMPT: z.string().default('select_account'),

  // Social Providers
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().default('onboarding@resend.dev'),

  // Security & Bot Protection
  ARCJET_KEY: z.string().min(1),
  ARCJET_BOT_MODE: z.enum(['LIVE', 'DRY_RUN']).default('LIVE'),
  ARCJET_RATE_LIMIT_MODE: z.enum(['LIVE', 'DRY_RUN']).default('LIVE'),

  // Redis & Cache
  REDIS_URL: z.string().optional(),
  SESSION_CACHE_PREFIX: z.string().default('session_cache:'),
  SESSION_DB_PREFIX: z.string().default('session:'),
  CACHE_TTL_SECONDS: z.coerce.number().default(3600),

  // Observability
  OTEL_PROMETHEUS_PORT: z.coerce.number().default(9464),
  OTEL_SERVICE_NAME: z.string().default('auth-service'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().default('http://localhost:4318/v1/traces'),
});

export type Env = z.infer<typeof envSchema>;
