import { Module } from '@nestjs/common';
import { AuthModule } from '@mguay/nestjs-better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { admin, emailOTP } from 'better-auth/plugins';
import {
  ArcjetModule,
  ArcjetGuard,
  detectBot,
  fixedWindow,
} from '@arcjet/nest';
import { join } from 'path';

import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

import { DatabaseModule } from './database/database.module';
import { DATABASE_CONNECTION } from './database/database-connection';
import * as authSchema from './auth/schema';

import { UsersModule } from './users/users.module';
import { AuthBridgeModule } from './auth/auth-bridge.module';
import { HealthController } from './health.controller';

import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SessionCacheInterceptor } from './common/interceptors/session-cache.interceptor';

import { TerminusModule } from '@nestjs/terminus';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import Redis from 'ioredis';

import { envSchema } from './types/env.types';

/* ---------------- MODULE ---------------- */

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
      validate: (config) => {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          console.error(
            '❌ Invalid environment variables:',
            parsed.error.format(),
          );
          throw new Error('Invalid environment variables');
        }
        return parsed.data;
      },
    }),

    RedisModule,
    DatabaseModule,

    ArcjetModule.forRootAsync({
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        key: config.getOrThrow('ARCJET_KEY'),
        rules: [
          detectBot({
            mode: config.get('ARCJET_BOT_MODE', 'LIVE') as any,
            allow: ['CATEGORY:SEARCH_ENGINE'],
          }),
          fixedWindow({
            mode: config.get('ARCJET_RATE_LIMIT_MODE', 'LIVE') as any,
            window: '1m',
            max: 60,
          }),
        ],
      }),
      inject: [ConfigService],
    }),

    AuthModule.forRootAsync({
      useFactory: (
        database: NodePgDatabase<typeof authSchema>,
        configService: ConfigService,
        redis: Redis,
      ) => ({
        auth: betterAuth({
          database: drizzleAdapter(database, { provider: 'pg' }),

          baseURL: configService.getOrThrow('BETTER_AUTH_BASE_URL'),
          secret: configService.getOrThrow('BETTER_AUTH_SECRET'),

          trustedOrigins:
            configService
              .getOrThrow<string>('ALLOWED_ORIGINS')
              .split(','),

          socialProviders: {
            google: {
              clientId: configService.getOrThrow('GOOGLE_CLIENT_ID'),
              clientSecret: configService.getOrThrow(
                'GOOGLE_CLIENT_SECRET',
              ),
              prompt: configService.get('AUTH_SOCIAL_PROMPT', 'select_account') as any,
            },
          },

          plugins: [
            admin(),
            emailOTP({
              async sendVerificationOTP({ email, otp }) {
                const { Resend } = await import('resend');
                const resend = new Resend(
                  configService.getOrThrow('RESEND_API_KEY'),
                );

            await resend.emails.send({
                  from: configService.getOrThrow<string>('EMAIL_FROM'),
                  to: email,
                  subject: 'Verify your email',
                  text: `Your verification code is ${otp}. It expires in 5 minutes.`,
                  html: `
                  <div style="
                    background-color: #f4f6f8;
                    padding: 40px 16px;
                  ">
                    <div style="
                      max-width: 480px;
                      margin: 0 auto;
                      background: #ffffff;
                      border-radius: 16px;
                      padding: 32px 24px;
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                      color: #111;
                      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
                      border: 1px solid #eaeaea;
                    ">

                      <!-- Header -->
                      <h2 style="
                        margin: 0 0 20px 0;
                        font-size: 22px;
                        font-weight: 600;
                        text-align: center;
                      ">
                        Email Verification
                      </h2>

                      <!-- Message -->
                      <p style="
                        font-size: 14px;
                        line-height: 1.6;
                        text-align: center;
                        margin: 0 0 24px 0;
                      ">
                        Use the verification code below to continue.
                      </p>

                      <!-- OTP Card -->
                      <div style="
                        margin: 24px auto;
                        padding: 18px 0;
                        max-width: 260px;
                        background: #fafafa;
                        border-radius: 12px;
                        border: 2px solid #000;
                        text-align: center;
                        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04),
                                    0 6px 16px rgba(0,0,0,0.12);
                      ">
                        <span style="
                          display: block;
                          font-size: 28px;
                          font-weight: 700;
                          letter-spacing: 6px;
                        ">
                          ${otp}
                        </span>
                      </div>

                      <!-- Expiry -->
                      <p style="
                        font-size: 13px;
                        color: #555;
                        text-align: center;
                        margin: 0 0 28px 0;
                      ">
                        This code expires in <strong>5 minutes</strong>.
                      </p>

                      <!-- Divider -->
                      <div style="
                        height: 1px;
                        background-color: #e6e6e6;
                        margin: 24px 0;
                      "></div>

                      <!-- Footer -->
                      <p style="
                        font-size: 12px;
                        color: #777;
                        line-height: 1.5;
                        text-align: center;
                        margin: 0;
                      ">
                        If you didn’t request this code, you can safely ignore this email.
                      </p>

                    </div>
                  </div>
                  `,
                });


              },
            }),
          ],

          databaseHooks: {
            session: {
              create: {
                before: async ({ userId }) => {
                  const sessions = await database
                    .select()
                    .from(authSchema.session)
                    .where(eq(authSchema.session.userId, userId));

                  for (const s of sessions) {
                    await redis.del(`session_cache:${s.token}`);
                    await redis.del(`session:${s.id}`);
                    await database
                      .delete(authSchema.session)
                      .where(eq(authSchema.session.id, s.id));
                  }
                },
              },
              delete: {
                before: async (session) => {
                  if (session.token) {
                    await redis.del(`session_cache:${session.token}`);
                  }
                  await redis.del(`session:${session.id}`);
                },
              },
            },
          },
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService, REDIS_CLIENT],
    }),

    AuthBridgeModule,
    UsersModule,
    TerminusModule,
  ],

  controllers: [HealthController],

  providers: [
    { provide: APP_GUARD, useClass: ArcjetGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionCacheInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
