import { Inject, Injectable } from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { Role, roleCodeToRole } from '../../../common/domain/role';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

interface ProjectMemberRow extends RowDataPacket {
  project_member_id: number | string;
  project_id: number | string;
  user_id: number | string;
  role_code: number;
  updated_at: Date | string;
}

export interface DbProjectMember {
  projectMemberId: number;
  projectId: number;
  userId: number;
  roleCode: number;
  role: Role;
  updatedAt: string;
}

@Injectable()
export class ProjectMemberRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async findByProjectAndUser(projectId: number, userId: number): Promise<DbProjectMember | undefined> {
    const [rows] = await this.pool.execute<ProjectMemberRow[]>(
      `SELECT project_member_id, project_id, user_id, role_code, updated_at
       FROM project_members
       WHERE project_id = :projectId
         AND user_id = :userId
       LIMIT 1`,
      { projectId, userId },
    );
    return rows[0] ? this.toProjectMember(rows[0]) : undefined;
  }

  private toProjectMember(row: ProjectMemberRow): DbProjectMember {
    return {
      projectMemberId: toNumber(row.project_member_id),
      projectId: toNumber(row.project_id),
      userId: toNumber(row.user_id),
      roleCode: row.role_code,
      role: roleCodeToRole(row.role_code),
      updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
    };
  }
}
