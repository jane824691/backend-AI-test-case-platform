import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../auth/request-with-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);

