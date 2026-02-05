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
import type { Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AuthService } from '@mguay/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
import * as authSchema from './schema';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AuthenticatedRequest } from 'src/types/auth-request';


interface ServiceJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  name?: string | null;
}

@Controller('api/bridge/auth')
export class AuthBridgeController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(DATABASE_CONNECTION)
    private readonly database: NodePgDatabase<typeof authSchema>,
  ) {}

  private getCookieOptions() {
    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    return {
      path: '/',
      httpOnly: true,
      ...(domain && { domain }),
    };
  }

  // 🔗 SESSION → SERVICE JWT
  @Get('_sync')
  async sync(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.instance.api.getSession({
      headers: req.headers as Record<string, string>,
    });

    if (!session?.user) {
      const cookieOptions = this.getCookieOptions();
      res.clearCookie('service_token', cookieOptions);
      res.clearCookie('better-auth.session_token', cookieOptions);
      throw new UnauthorizedException('Not authenticated');
    }

    const accounts = await this.database.query.account.findMany({
      where: eq(authSchema.account.userId, session.user.id),
    });

    const provider =
      accounts.length > 0
        ? accounts.map((a) => a.providerId).join(',')
        : 'email';

    req.user = session.user;
    req.provider = provider;

    const secret = this.configService.get<string>('SERVICE_JWT_SECRET');
    if (!secret) {
      throw new Error('SERVICE_JWT_SECRET is not configured');
    }

    const payload: ServiceJwtPayload = {
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };

    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    res.cookie('service_token', token, {
      ...this.getCookieOptions(),
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
    });

    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );

    return { ok: true, user: session.user };
  }

  // 🚪 LOGOUT
  @Get('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.instance.api.getSession({
      headers: req.headers as Record<string, string>,
    });

    if (session?.user) {
      const accounts = await this.database.query.account.findMany({
        where: eq(authSchema.account.userId, session.user.id),
      });

      req.user = session.user;
      req.provider =
        accounts.length > 0
          ? accounts.map((a) => a.providerId).join(',')
          : 'email';
    }

    await this.authService.instance.api.signOut({
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(
          ([, value]) => typeof value === 'string',
        ),
      ) as Record<string, string>,
    });

    const cookieOptions = this.getCookieOptions();
    res.clearCookie('service_token', cookieOptions);
    res.clearCookie('better-auth.session_token', cookieOptions);

    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );

    return { ok: true };
  }

  // 🔍 CHECK AUTH PROVIDER
  @Post('check-provider')
    async checkProvider(@Body('email') email: string) {
      const user = await this.database.query.user.findFirst({
        where: eq(authSchema.user.email, email),
      });

      if (!user) {
        return { provider: 'none' };
      }

      const accounts = await this.database.query.account.findMany({
        where: eq(authSchema.account.userId, user.id),
      });

      return {
        provider:
          accounts.length > 0
            ? accounts.map((a) => a.providerId).join(',')
            : 'email',
      };
    }
}
