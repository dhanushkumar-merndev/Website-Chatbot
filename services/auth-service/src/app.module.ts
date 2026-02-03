import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AuthModule } from '@mguay/nestjs-better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { admin } from 'better-auth/plugins';


import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { DATABASE_CONNECTION } from './database/database-connection';
import { AuthBridgeModule } from './auth/auth-bridge.module';
import { HealthController } from './health.controller';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ThrottlerGuard } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import * as authSchema from './auth/schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(4000),
        DATABASE_URL: Joi.string().required(),
        BETTER_AUTH_SECRET: Joi.string().required(),
        BETTER_AUTH_BASE_URL: Joi.string().required(),
        SERVICE_JWT_SECRET: Joi.string().required(),
        ALLOWED_ORIGINS: Joi.string().required(),
        COOKIE_DOMAIN: Joi.string().optional(),
        GOOGLE_CLIENT_ID: Joi.string().required(),
        GOOGLE_CLIENT_SECRET: Joi.string().required(),
        RESEND_API_KEY: Joi.string().required(),
      }),
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    DatabaseModule,
    AuthModule.forRootAsync({
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: betterAuth({
          database: drizzleAdapter(database, {
            provider: 'pg',
          }),
          baseURL: configService.get<string>('BETTER_AUTH_BASE_URL'),
          secret: configService.get<string>('BETTER_AUTH_SECRET'),
          emailOTP: {
            enabled: true,
            async sendVerificationOTP({ email, otp, type }) {
              try {
                const { Resend } = await import("resend");
                const resend = new Resend(configService.get("RESEND_API_KEY"));
                await resend.emails.send({
                  from: "onboarding@resend.dev",
                  to: email,
                  subject: "Your Verify OTP",
                  html: `<p>Your OTP is ${otp}</p>`,
                });
              } catch (e) {
                console.error("Failed to send OTP", e);
              }
            },
          },
          socialProviders: {
            google: {
              clientId: configService.get<string>('GOOGLE_CLIENT_ID')!,
              clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
            },
          },
          trustedOrigins: configService.get<string>('ALLOWED_ORIGINS')?.split(',') || [],
          plugins: [
            admin(),
            {
              id: "auth-logger",
              onResponse: async (context: any) => {
                const { response, request } = context;
                if (!request || !response) return;
                
                try {
                  const url = new URL(request.url, request.url.startsWith('http') ? undefined : 'http://localhost');
                  
                  if (url.pathname.includes("/sign-in/")) {
                    let provider = url.pathname.split("/").pop();
                    if (provider === "social") provider = "google/social";

                    const status = response.ok ? "SUCCESS" : "FAILURE";
                    console.log(`[AUTH] [${status}] - Provider: [${provider}]`);
                  }
                } catch (e) {
                  console.error("[AUTH LOGGER ERROR]", e);
                }
                return;
              },
            }
          ],
          databaseHooks: {
            session: {
              create: {
                before: async (session) => {
                  // Enforce one session per user: Delete all existing sessions
                  await database
                    .delete(authSchema.session)
                    .where(eq(authSchema.session.userId, session.userId));
                },
              },
            },
          },
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
    AuthBridgeModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // LoggerMiddleware removed as requested for cleaner terminal output
  }
}
