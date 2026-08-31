import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Public } from '../../common/authorization/public.decorator';
import { SessionUser } from '../../common/auth/session-user';
import { stubResponse } from '../../common/http/api-response';
import { AuthService } from './auth.service';
import { CreateDevSessionDto } from './dto/create-dev-session.dto';
import { SessionStore } from './session/session-store';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionStore: SessionStore,
  ) {}

  @Get('session')
  getSession(@CurrentUser() user: SessionUser) {
    return stubResponse({ user });
  }

  @Post('dev-session')
  @Public()
  async createDevelopmentSession(
    @Body() input: CreateDevSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      return { error: { code: 'NOT_FOUND', message: 'Not found.' } };
    }
    const session = await this.authService.createDevelopmentSession(input);
    response.cookie(this.sessionStore.cookieName, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.SESSION_SECURE === 'true',
      expires: session.expiresAt,
    });
    return stubResponse({ user: session.user, expiresAt: session.expiresAt.toISOString() });
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(this.sessionStore.cookieName);
    return { data: { loggedOut: true } };
  }
}

