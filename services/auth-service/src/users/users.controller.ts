import * as nestjsBetterAuth from '@mguay/nestjs-better-auth';
import { Controller, Get, UseGuards } from '@nestjs/common';

@Controller('api/users')
@UseGuards(nestjsBetterAuth.AuthGuard)
export class UsersController {
  @Get('session')
  async getSession(@nestjsBetterAuth.Session() session: nestjsBetterAuth.UserSession) {
    return session;
  }
}
