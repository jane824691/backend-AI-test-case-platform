import { Role } from '../domain/role';

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  globalRole: Role;
  projectRole: Role;
  roleCode?: number;
}
