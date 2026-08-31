import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithUser } from '../auth/request-with-user';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionStore } from '../../modules/auth/session/session-store';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionStore: SessionStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const sessionId = request.cookies?.[this.sessionStore.cookieName];
    if (!sessionId) throw new UnauthorizedException('An authenticated session is required.');

    const session = await this.sessionStore.get(sessionId);
    if (!session) throw new UnauthorizedException('The session is missing or expired.');

    request.user = session.user;
    return true;
  }
}

