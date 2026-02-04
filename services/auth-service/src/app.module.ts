import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthModule } from '@mguay/nestjs-better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { admin, emailOTP } from 'better-auth/plugins';
import { ArcjetModule, ArcjetGuard, detectBot, fixedWindow } from '@arcjet/nest';
import { join } from 'path';

import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { DATABASE_CONNECTION } from './database/database-connection';
import { AuthBridgeModule } from './auth/auth-bridge.module';
import { HealthController } from './health.controller';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { eq } from 'drizzle-orm';
import * as authSchema from './auth/schema';
import { RedisModule, REDIS_CLIENT } from './redis/redis.module';
import Redis from 'ioredis';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_BASE_URL: z.string().min(1),
  SERVICE_JWT_SECRET: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  ARCJET_KEY: z.string().default('aj_your_key_here'),
  REDIS_URL: z.string().optional(),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
      validate: (config) => {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
          throw new Error('Invalid environment variables');
        }
        return parsed.data;
      },
    }),
    RedisModule,
    ArcjetModule.forRootAsync({
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        key: config.get<string>('ARCJET_KEY') || 'aj_your_key_here',
        rules: [
          detectBot({
            mode: "LIVE",
            allow: ["CATEGORY:SEARCH_ENGINE"],
          }),
          fixedWindow({
            mode: "LIVE",
            window: "1m",
            max: 60,
          }),
        ],
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuthModule.forRootAsync({
        useFactory: (database: NodePgDatabase, configService: ConfigService, redis: Redis) => ({
            auth: betterAuth({
                database: drizzleAdapter(database, {
                    provider: 'pg',
                }),
                // REMOVED root secondaryStorage so sessions are saved to DB
                baseURL: configService.get<string>('BETTER_AUTH_BASE_URL'),
                secret: configService.get<string>('BETTER_AUTH_SECRET'),
                socialProviders: {
                    google: {
                        clientId: configService.get<string>('GOOGLE_CLIENT_ID')!,
                        clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
                        prompt: "select_account",
                    },
                },
                trustedOrigins: configService.get<string>('ALLOWED_ORIGINS')?.split(',') || [],
                plugins: [
                    admin(),
                    emailOTP({
                        async sendVerificationOTP({ email, otp, type }) {
                            try {
                                const { Resend } = await import("resend");
                                const resend = new Resend(configService.get("RESEND_API_KEY"));
                                await resend.emails.send({
                                    from: "onboarding@resend.dev",
                                    to: email,
                                    subject: `Verify your email`,
                                    html: `
                                    <div style="
                                            max-width: 480px;
                                            margin: 40px auto;
                                            padding: 32px 24px;
                                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                                            background-color: #ffffff;
                                            color: #000000;
                                            border-radius: 14px;
                                            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
                                            border: 1px solid #e6e6e6;
                                            ">

                                            <!-- Header -->
                                            <h2 style="
                                                margin: 0 0 24px 0;
                                                font-size: 22px;
                                                font-weight: 600;
                                                text-align: center;
                                            ">
                                                WebiChat Verification
                                            </h2>

                                            <!-- Message -->
                                            <p style="
                                                font-size: 14px;
                                                line-height: 1.6;
                                                margin: 0 0 20px 0;
                                                text-align: center;
                                            ">
                                                Use the verification code below to sign in.
                                            </p>

                                            <!-- OTP Box -->
                                            <div style="
                                                margin: 24px auto;
                                                padding: 18px 0;
                                                width: 100%;
                                                max-width: 260px;
                                                border: 2px solid #000000;
                                                border-radius: 10px;
                                                text-align: center;
                                                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
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
                                                color: #555555;
                                                margin: 0 0 28px 0;
                                                text-align: center;
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
                                                color: #777777;
                                                line-height: 1.5;
                                                text-align: center;
                                                margin: 0;
                                            ">
                                                If you didn’t request this code, you can safely ignore this email.
                                            </p>

                                            </div>

                    `,
                                });
                            } catch (e) {
                                console.error(`[AUTH] [OTP] [ERROR] Failed to send to ${email}:`, e);
                            }
                        },
                    }),
                ],
                databaseHooks: {
                    session: {
                        create: {
                            before: async (newSession) => {
                                console.log(`[AUTH] Enforcing single session for user: ${newSession.userId}`);
                                try {
                                    const existingSessions = await database
                                        .select({ id: authSchema.session.id, token: authSchema.session.token })
                                        .from(authSchema.session)
                                        .where(eq(authSchema.session.userId, newSession.userId));
                    
                                    if (existingSessions.length > 0) {
                                        for (const s of existingSessions) {
                                            // Clear from Redis (both cache and any internal keys)
                                            await redis.del(`session_cache:${s.token}`);
                                            await redis.del(`session:${s.id}`);
                                            await redis.del(`session:${s.token}`);
                        
                                            // Delete from DB
                                            await database
                                                .delete(authSchema.session)
                                                .where(eq(authSchema.session.id, s.id));
                                        }
                                        console.log(`[AUTH] Revoked ${existingSessions.length} sessions.`);
                                    }
                                } catch (err) {
                                    console.error(`[AUTH] Hook error:`, err);
                                }
                            }
                        },
                        delete: {
                            before: async (session) => {
                                console.log(`[AUTH] Cleaning up session on logout: ${session.id}`);
                                try {
                                    const token = session.token;
                                    if (token) {
                                        await redis.del(`session_cache:${token}`);
                                        console.log(`[AUTH] [CACHE_DEL] Cleared session cache for token ...${token.slice(-10)}`);
                                    }
                                    await redis.del(`session:${session.id}`);
                                    await redis.del(`session:${session.token}`);
                                } catch (err) {
                                    console.error(`[AUTH] [CACHE_ERROR] Failed to clear session on logout:`, err);
                                }
                            }
                        }

                    }
                }
            })
        }),
        inject: [DATABASE_CONNECTION, ConfigService, REDIS_CLIENT],
    }),
    AuthBridgeModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ArcjetGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {}
}
