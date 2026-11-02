import type { TeamView } from '../../src/client/team-api.js'
export function teamFixture(): TeamView {
  return {
    user: { id: 'admin', username: 'admin', role: 'admin' },
    capabilities: {
      useStandalone: true,
      createProject: true,
      manageUsers: true,
      managePermissions: true,
      manageTools: true,
    },
    personalSessions: [],
    projects: [
      {
        id: 'p1',
        name: '门户评估',
        role: 'manager',
        sessions: ['session-123'],
        createdBy: 'admin',
      },
    ],
    users: [
      {
        id: 'alice',
        username: 'alice',
        role: 'member',
        disabled: false,
        must_change: true,
        roleIds: ['member'],
      },
      {
        id: 'admin',
        username: 'admin',
        role: 'admin',
        disabled: false,
        must_change: true,
        roleIds: ['admin'],
      },
    ],
    roles: [
      { id: 'admin', name: '系统管理员', description: '全部权限', builtin: true, grants: [] },
      {
        id: 'member',
        name: '普通用户',
        description: '默认角色',
        builtin: true,
        grants: [{ permission: 'project.create', resource: '*' }],
      },
    ],
    permissions: { resources: [{ id: 'p1', name: '门户评估' }], overrides: [] },
  }
}
