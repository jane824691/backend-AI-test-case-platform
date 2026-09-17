import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SessionUser } from '../../../common/auth/session-user';
import { UserRepository } from '../../../infrastructure/db/repositories/user.repository';
import { AppRedisClient, REDIS_CLIENT } from '../../../infrastructure/redis/redis-client';

export interface UserSession {
  id: string;
  user: SessionUser;
  expiresAt: Date;
}

interface StoredSession {
  userId: number;
  expiresAt: string;
  isDevelopmentSession?: boolean;
}

@Injectable()
export class SessionStore {
  readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'ai_test_platform_session';
  private readonly ttlSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 8);
  private readonly keyPrefix = process.env.SESSION_REDIS_KEY_PREFIX ?? 'ai-test-platform:session:';

  constructor(
    private readonly userRepository: UserRepository,
    @Inject(REDIS_CLIENT) private readonly redis: AppRedisClient,
  ) {}

  async create(user: SessionUser): Promise<UserSession> {
    const session: UserSession = {
      id: randomUUID(),
      user,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    };

    const storedSession: StoredSession = {
      userId: Number(user.userId),
      expiresAt: session.expiresAt.toISOString(),
      isDevelopmentSession: user.isDevelopmentSession,
    };

    await this.redis.set(this.sessionKey(session.id), JSON.stringify(storedSession), { EX: this.ttlSeconds });
    return session;
  }

  async get(id: string): Promise<UserSession | undefined> {
    const rawSession = await this.redis.get(this.sessionKey(id));
    if (!rawSession) return undefined;

    const storedSession = this.parseStoredSession(rawSession);
    if (!storedSession) {
      await this.delete(id);
      return undefined;
    }

    const expiresAt = new Date(storedSession.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await this.delete(id);
      return undefined;
    }

    const user = await this.userRepository.findById(storedSession.userId);
    if (!user) {
      await this.delete(id);
      return undefined;
    }

    return {
      id,
      expiresAt,
      user: {
        userId: String(user.userId),
        name: user.name,
        email: user.email,
        globalRole: user.role,
        projectRole: user.role,
        roleCode: user.roleCode,
        isDevelopmentSession: storedSession.isDevelopmentSession,
      },
    };
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.sessionKey(id));
  }

  private sessionKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private parseStoredSession(rawSession: string): StoredSession | undefined {
    try {
      const parsed = JSON.parse(rawSession) as Partial<StoredSession>;
      if (typeof parsed.userId !== 'number' || typeof parsed.expiresAt !== 'string') return undefined;
      return {
        userId: parsed.userId,
        expiresAt: parsed.expiresAt,
        isDevelopmentSession: parsed.isDevelopmentSession === true,
      };
    } catch {
      return undefined;
    }
  }
}

export type RedisSessionStore = Pick<SessionStore, 'create' | 'get' | 'delete' | 'cookieName'>;
