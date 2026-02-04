import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '@mguay/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
import * as authSchema from './schema';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Controller('api/bridge/auth')
export class AuthBridgeController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(DATABASE_CONNECTION) private readonly database: NodePgDatabase<typeof authSchema>,
  ) {}

  onModuleInit() {
    // Controller initialized
  }

  // 🔗 SESSION → SERVICE JWT
  @Get('_sync')
  async sync(@Req() req: Request, @Res() res: Response) {
    const session = await this.authService.instance.api.getSession({
      headers: req.headers as any,
    });

    if (!session?.user) {
      const domain = this.configService.get<string>('COOKIE_DOMAIN');
      const cookieOptions = {
        path: '/',
        ...(domain && { domain }),
        httpOnly: true,
      };
      
      res.clearCookie('service_token', cookieOptions);
      res.clearCookie('better-auth.session_token', cookieOptions);
      res.clearCookie('better-auth.session_token', { ...cookieOptions, secure: true });

      throw new UnauthorizedException('Not authenticated');
    }

    // Attach user to request for LoggingInterceptor
    const accounts = await this.database.query.account.findMany({
      where: eq(authSchema.account.userId, session.user.id),
    });
    // If no accounts are linked, it's an email/password or email OTP login
    const provider = accounts.length > 0 
      ? accounts.map(a => a.providerId).join(',') 
      : 'email';

    (req as any).user = session.user;
    (req as any).provider = provider;

    const token = jwt.sign(
      {
        sub: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      this.configService.get<string>('SERVICE_JWT_SECRET')!,
      { expiresIn: '7d' },
    );

    const isProd = this.configService.get('NODE_ENV') === 'production';
    const domain = this.configService.get<string>('COOKIE_DOMAIN');

    res.cookie('service_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      ...(domain && { domain }),
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({ ok: true, user: session.user });
  }

  // 🚪 LOGOUT
  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const session = await this.authService.instance.api.getSession({
      headers: req.headers as any,
    });
    
    if (session?.user) {
      
      const accounts = await this.database.query.account.findMany({
        where: eq(authSchema.account.userId, session.user.id),
      });
      // Fallback to 'email' if no social accounts linked
      const provider = accounts.length > 0 
        ? accounts.map(a => a.providerId).join(',') 
        : 'email';

      (req as any).user = session.user;
      (req as any).provider = provider;
    }

    await this.authService.instance.api.signOut({
      headers: req.headers as any,
    });

    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    const cookieOptions = {
      path: '/',
      ...(domain && { domain }),
      httpOnly: true,
    };

    res.clearCookie('service_token', cookieOptions);
    res.clearCookie('better-auth.session_token', cookieOptions);
    res.clearCookie('better-auth.session_token', { ...cookieOptions, secure: true });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({ ok: true });
  }

  // 🔍 CHECK AUTH PROVIDER
  @Post('check-provider')
  async checkProvider(@Body('email') email: string) {
    try {
      const result = await (this.authService.instance.api as any).listUsers({
        query: [{ field: 'email', value: email, operator: 'eq' }],
      });

      return result?.users?.length
        ? { provider: 'email' }
        : { provider: 'none' };
    } catch {
      return { provider: 'none' };
    }
  }
}
