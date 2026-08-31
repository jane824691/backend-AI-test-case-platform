import { Inject, Injectable } from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { Role, roleCodeByRole, roleCodeToRole } from '../../../common/domain/role';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

interface UserRow extends RowDataPacket {
  user_id: number | string;
  name: string;
  email: string;
  role_code: number;
  updated_at: Date | string;
}

export interface DbUser {
  userId: number;
  name: string;
  email: string;
  roleCode: number;
  role: Role;
  updatedAt: string;
}

@Injectable()
export class UserRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async findById(userId: number): Promise<DbUser | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT user_id, name, email, role_code, updated_at
       FROM users
       WHERE user_id = :userId
       LIMIT 1`,
      { userId },
    );
    return rows[0] ? this.toUser(rows[0]) : undefined;
  }

  async findByEmail(email: string): Promise<DbUser | undefined> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT user_id, name, email, role_code, updated_at
       FROM users
       WHERE email = :email
       LIMIT 1`,
      { email },
    );
    return rows[0] ? this.toUser(rows[0]) : undefined;
  }

  async findFirstByRole(role: Role): Promise<DbUser | undefined> {
    const roleCodes = roleCodeByRole[role];
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT user_id, name, email, role_code, updated_at
       FROM users
       WHERE role_code IN (?)
       ORDER BY role_code ASC, user_id ASC
       LIMIT 1`,
      [roleCodes],
    );
    return rows[0] ? this.toUser(rows[0]) : undefined;
  }

  private toUser(row: UserRow): DbUser {
    return {
      userId: toNumber(row.user_id),
      name: row.name,
      email: row.email,
      roleCode: row.role_code,
      role: roleCodeToRole(row.role_code),
      updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
    };
  }
}
