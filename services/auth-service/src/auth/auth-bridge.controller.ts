import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '@mguay/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';

@Controller('api/bridge/auth')
export class AuthBridgeController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
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

    return res.json({ ok: true, user: session.user });
  }

  // 🚪 LOGOUT
  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
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
