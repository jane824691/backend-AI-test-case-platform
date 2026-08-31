export enum Role {
  Admin = 'admin',
  PM = 'pm',
  QA = 'qa',
  Developer = 'developer',
}

export const roleCodeByRole: Record<Role, number[]> = {
  [Role.Admin]: [0],
  [Role.PM]: [1],
  [Role.QA]: [2],
  [Role.Developer]: [3, 4, 5, 6],
};

export function roleCodeToRole(roleCode: number): Role {
  if (roleCode === 0) return Role.Admin;
  if (roleCode === 1) return Role.PM;
  if (roleCode === 2) return Role.QA;
  return Role.Developer;
}
