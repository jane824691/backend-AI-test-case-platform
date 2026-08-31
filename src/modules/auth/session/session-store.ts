import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SessionUser } from '../../../common/auth/session-user';
import { UserRepository } from '../../../infrastructure/db/repositories/user.repository';

export interface UserSession {
  id: string;
  user: SessionUser;
  expiresAt: Date;
}

@Injectable()
export class SessionStore {
  readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'ai_test_platform_session';
  private readonly sessions = new Map<string, { userId: number; expiresAt: Date }>();

  constructor(private readonly userRepository: UserRepository) {}

  async create(user: SessionUser): Promise<UserSession> {
    const session: UserSession = {
      id: randomUUID(),
      user,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8),
    };
    this.sessions.set(session.id, { userId: Number(user.userId), expiresAt: session.expiresAt });
    return session;
  }

  async get(id: string): Promise<UserSession | undefined> {
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= new Date()) {
      this.sessions.delete(id);
      return undefined;
    }
    const user = await this.userRepository.findById(session.userId);
    if (!user) {
      this.sessions.delete(id);
      return undefined;
    }
    return {
      id,
      expiresAt: session.expiresAt,
      user: {
        userId: String(user.userId),
        name: user.name,
        email: user.email,
        globalRole: user.role,
        projectRole: user.role,
        roleCode: user.roleCode,
      },
    };
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

// Production adapter contract: preserve this API when replacing the in-memory map with Redis.
export type RedisSessionStore = Pick<SessionStore, 'create' | 'get' | 'delete' | 'cookieName'>;
