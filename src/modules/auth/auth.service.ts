import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { UserRepository } from '../../infrastructure/db/repositories/user.repository';
import { CreateDevSessionDto } from './dto/create-dev-session.dto';
import { SessionStore, UserSession } from './session/session-store';

@Injectable()
export class AuthService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly userRepository: UserRepository,
  ) {}

  async createDevelopmentSession(input: CreateDevSessionDto): Promise<UserSession> {
    const dbUser = input.email
      ? await this.userRepository.findByEmail(input.email)
      : await this.userRepository.findFirstByRole(input.role);
    if (!dbUser) {
      throw new NotFoundException(`No database user is available for role ${input.role}.`);
    }

    const user: SessionUser = {
      userId: String(dbUser.userId),
      name: input.name ?? dbUser.name,
      email: dbUser.email,
      globalRole: dbUser.role,
      projectRole: dbUser.role,
      roleCode: dbUser.roleCode,
    };
    return this.sessionStore.create(user);
  }
}
