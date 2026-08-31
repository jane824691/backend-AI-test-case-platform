import { Inject, Injectable } from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { Role } from '../../../common/domain/role';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

interface ProjectRow extends RowDataPacket {
  project_id: number | string;
  name: string;
  status_code: number;
  updated_at: Date | string;
}

export interface DbProject {
  projectId: number;
  name: string;
  statusCode: number;
  updatedAt: string;
}

@Injectable()
export class ProjectRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async listForUser(userId: number, role: Role): Promise<DbProject[]> {
    if (role === Role.Admin) {
      const [rows] = await this.pool.execute<ProjectRow[]>(
        `SELECT project_id, name, status_code, updated_at
         FROM projects
         WHERE status_code = 1
         ORDER BY updated_at DESC, project_id DESC`,
      );
      return rows.map((row) => this.toProject(row));
    }

    const [rows] = await this.pool.execute<ProjectRow[]>(
      `SELECT p.project_id, p.name, p.status_code, p.updated_at
       FROM projects p
       INNER JOIN project_members pm ON pm.project_id = p.project_id
       WHERE pm.user_id = :userId
         AND p.status_code = 1
       ORDER BY p.updated_at DESC, p.project_id DESC`,
      { userId },
    );
    return rows.map((row) => this.toProject(row));
  }

  private toProject(row: ProjectRow): DbProject {
    return {
      projectId: toNumber(row.project_id),
      name: row.name,
      statusCode: row.status_code,
      updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
    };
  }
}
