import { Request } from 'express';
import { SessionUser } from './session-user';

export interface RequestWithUser extends Request {
  user?: SessionUser;
}

