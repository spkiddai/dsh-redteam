import { describe, expect, it } from 'vitest'
import { permitted, type PermissionGrant } from '../src/lib/permissions.js'
import { TeamStore } from '../src/lib/team-database.js'
import { embeddedDatabase } from '../src/lib/embedded-database.js'
describe('role permissions and user overrides', () => {
  it('resolves inheritance, resource scopes and explicit denies consistently', () => {
    const roles: PermissionGrant[] = [
      { permission: 'project.manage', resource: 'p1' },
      { permission: 'users.manage', resource: '*' },
    ]
    expect(permitted('project.read', 'p1', roles, [])).toBe(true)
    expect(permitted('project.run', 'p2', roles, [])).toBe(false)
    expect(
      permitted('project.manage', 'p1', roles, [
        { permission: 'project.run', resource: '*', effect: 'deny' },
      ]),
    ).toBe(false)
    expect(
      permitted('project.read', 'p1', roles, [
        { permission: 'project.manage', resource: 'p1', effect: 'deny' },
      ]),
    ).toBe(true)
    expect(
      permitted('project.run', 'p1', roles, [
        { permission: 'project.read', resource: 'p1', effect: 'deny' },
      ]),
    ).toBe(false)
    expect(
      permitted('users.manage', '*', roles, [
        { permission: 'users.manage', resource: '*', effect: 'deny' },
      ]),
    ).toBe(false)
    expect(
      permitted(
        'tools.manage',
        '*',
        [],
        [{ permission: 'tools.manage', resource: '*', effect: 'allow' }],
      ),
    ).toBe(true)
  })
  it('stores reusable roles, independent accounts, immediate overrides and protected administrator access', async () => {
    const db = embeddedDatabase('memory://'),
      store = new TeamStore(db)
    try {
      await store.initialize()
      const admin = (await store.login('admin', 'admin', 'admin')).user
      const alice = await store.createUser(admin.id, 'alice', '12345678', 'member')
      expect(store.projects).toHaveLength(0)
      expect(store.can(alice.id, 'project.create')).toBe(true)
      await store.addProject(admin.id, {
        id: 'p1',
        name: 'Project',
        owner_id: admin.id,
        root_path: '/p1',
        workspace_id: 'w1',
      })
      await store.addSession(admin.id, 'p1', 's1')
      const analyst = await store.saveRole(admin.id, {
        name: 'Analyst',
        description: 'Can review selected resources',
        grants: [{ permission: 'project.run', resource: 'p1' }],
      })
      const token = (await store.login('alice', '12345678', 'alice')).token
      await store.setUserRoles(admin.id, alice.id, [analyst.id])
      expect(await store.authenticate(token)).toBeUndefined()
      expect(store.can(alice.id, 'project.create')).toBe(false)
      expect(store.allowsSession(alice.id, 's1', 'write')).toBe(true)
      expect(store.restrictedSession('s1')).toBe(true)
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'project.run', resource: 'p1' },
        'deny',
      )
      expect(store.allowsSession(alice.id, 's1', 'write')).toBe(false)
      expect(store.allowsSession(alice.id, 's1', 'read')).toBe(true)
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'project.run', resource: 'p1' },
        null,
      )
      expect(store.allowsSession(alice.id, 's1', 'write')).toBe(true)
      await store.saveRole(admin.id, {
        id: analyst.id,
        name: 'Reviewer',
        description: 'Read only',
        grants: [{ permission: 'project.read', resource: '*' }],
      })
      expect(store.allowsSession(alice.id, 's1', 'write')).toBe(false)
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'users.manage', resource: '*' },
        'allow',
      )
      await store.createUser(alice.id, 'bob', '12345678', 'member')
      await expect(store.createUser(alice.id, 'evil', '12345678', 'admin')).rejects.toThrow('权限')
      await expect(store.setUserRoles(alice.id, alice.id, ['admin'])).rejects.toThrow('权限')
      await expect(store.setUserRoles(admin.id, admin.id, [])).rejects.toThrow('至少')
      await expect(
        store.saveRole(admin.id, { id: 'admin', name: 'break', description: '', grants: [] }),
      ).rejects.toThrow('不可修改')
      await expect(
        store.saveRole(admin.id, {
          name: 'Bad',
          description: '',
          grants: [{ permission: 'project.read', resource: 'missing' }],
        }),
      ).rejects.toThrow('资源')
      await expect(
        store.saveRole(admin.id, { id: 'missing', name: 'Missing', description: '', grants: [] }),
      ).rejects.toThrow('不存在')
      await expect(
        store.saveRole(admin.id, { name: ' ', description: '', grants: [] }),
      ).rejects.toThrow('无效')
      await expect(store.setUserRoles(admin.id, alice.id, ['missing'])).rejects.toThrow('无效')
      await expect(store.setUserRoles(admin.id, 'missing', [])).rejects.toThrow('不存在')
      await expect(
        store.setUserPermission(
          admin.id,
          'missing',
          { permission: 'project.read', resource: '*' },
          'allow',
        ),
      ).rejects.toThrow('不存在')
      await expect(
        store.setUserPermission(
          admin.id,
          admin.id,
          { permission: 'users.manage', resource: '*' },
          'deny',
        ),
      ).rejects.toThrow('完整权限')
      await expect(
        store.setUserPermission(
          admin.id,
          alice.id,
          { permission: 'users.manage', resource: 'p1' },
          'allow',
        ),
      ).rejects.toThrow('资源')
      await expect(
        store.setUserPermission(
          admin.id,
          alice.id,
          { permission: 'users.manage', resource: '*' },
          'bad' as never,
        ),
      ).rejects.toThrow('方式')
      await store.setUserRoles(admin.id, alice.id, [])
      const reloaded = new TeamStore(db)
      await reloaded.initialize()
      expect(reloaded.roleIds(alice.id)).toEqual([])
      expect(reloaded.can(alice.id, 'project.create')).toBe(false)
      expect(reloaded.can(alice.id, 'users.manage')).toBe(true)
    } finally {
      await db.close()
    }
  }, 20000)
  it('migrates existing ownership and collaboration only once into resource grants', async () => {
    const db = embeddedDatabase('memory://'),
      store = new TeamStore(db)
    try {
      await store.initialize()
      const admin = store.users[0]!
      const alice = await store.createUser(admin.id, 'alice', '12345678', 'member'),
        bob = await store.createUser(admin.id, 'bob', '12345678', 'member')
      await store.addProject(alice.id, {
        id: 'legacy',
        name: 'Legacy',
        owner_id: alice.id,
        workspace_id: 'wl',
        root_path: '/legacy',
      })
      await db.query('DELETE FROM prism_user_permissions')
      await db.query("INSERT INTO prism_members VALUES('legacy',$1,'viewer')", [bob.id])
      await db.query("DELETE FROM prism_schema_migrations WHERE version='permissions-v1'")
      await store.initialize()
      expect(store.allows(alice.id, 'legacy', 'manage')).toBe(true)
      expect(store.allows(bob.id, 'legacy', 'read')).toBe(true)
      await store.setUserPermission(
        admin.id,
        alice.id,
        { permission: 'project.manage', resource: 'legacy' },
        null,
      )
      expect(store.allows(alice.id, 'legacy', 'read')).toBe(false)
      await store.initialize()
      expect(store.allows(alice.id, 'legacy', 'manage')).toBe(false)
    } finally {
      await db.close()
    }
  }, 20000)
})
