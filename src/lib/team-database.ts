import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import pg from 'pg'
import {
  PERMISSIONS,
  permitted,
  type AccessRole,
  type PermissionGrant,
  type PermissionKey,
  type RolePermission,
  type UserPermission,
  type UserRoleBinding,
} from './permissions.js'

export interface SqlConnection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>
}
export interface TeamDatabase extends SqlConnection {
  transaction<T>(operation: (connection: SqlConnection) => Promise<T>): Promise<T>
  close(): Promise<void>
}
export function postgresDatabase(connectionString: string): TeamDatabase {
  const pool = new pg.Pool({
    connectionString,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  })
  pool.on('error', () => {
    /* Requests fail closed; never log credentials or connection strings. */
  })
  return {
    query: (sql, values) => pool.query(sql, values),
    async transaction(operation) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await operation(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export type UserRole = 'admin' | 'member'
export type ProjectRole = 'manager' | 'editor' | 'viewer'
export interface TeamUser extends Record<string, unknown> {
  id: string
  username: string
  role: UserRole
  disabled: boolean
  /** Legacy column name; only recommends changing the initial/reset password. */
  must_change: boolean
}
interface PasswordUser extends TeamUser {
  salt: string
  hash: string
}
export interface TeamProject extends Record<string, unknown> {
  id: string
  name: string
  owner_id: string
  workspace_id: string
  root_path: string
}
interface ProjectSession extends Record<string, unknown> {
  session_id: string
  project_id: string
}
export interface PersonalSession extends Record<string, unknown> {
  session_id: string
  user_id: string
  workspace_id: string
  root_path: string
}
export class TeamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
const USER_FIELDS = 'id, username, role, disabled, must_change'
const SESSION_MS = 8 * 60 * 60 * 1000
export const tokenKey = (token: string) => createHash('sha256').update(token).digest('hex')
async function hashPassword(password: string, salt: string): Promise<Buffer> {
  return await new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  )
}
function validPassword(password: string) {
  if (password.length < 8 || password.length > 128)
    throw new TeamError(400, '密码长度须为 8–128 位。')
}
function publicUser(row: TeamUser): TeamUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    disabled: row.disabled,
    must_change: row.must_change,
  }
}

/** PostgreSQL owns identities and grants. DSH continues to own conversation persistence. */
export class TeamStore {
  users: TeamUser[] = []
  projects: TeamProject[] = []
  sessions: ProjectSession[] = []
  personalSessions: PersonalSession[] = []
  roles: AccessRole[] = []
  rolePermissions: RolePermission[] = []
  userRoles: UserRoleBinding[] = []
  userPermissions: UserPermission[] = []
  private readonly knownSessions = new Set<string>()
  private refreshTail: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  constructor(readonly db: TeamDatabase) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private changed() {
    for (const listener of this.listeners) listener()
  }
  async initialize() {
    await this.db.transaction(async (db) => {
      await db.query(`CREATE TABLE IF NOT EXISTS prism_users (
        id text PRIMARY KEY, username text NOT NULL, username_key text NOT NULL UNIQUE,
        salt text NOT NULL, hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member')),
        disabled boolean NOT NULL DEFAULT false, must_change boolean NOT NULL DEFAULT true);
        CREATE TABLE IF NOT EXISTS prism_auth_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES prism_users(id), expires_at bigint NOT NULL);
        CREATE TABLE IF NOT EXISTS prism_projects (id text PRIMARY KEY, name text NOT NULL, owner_id text NOT NULL REFERENCES prism_users(id), workspace_id text NOT NULL UNIQUE, root_path text NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS prism_members (project_id text NOT NULL REFERENCES prism_projects(id), user_id text NOT NULL REFERENCES prism_users(id), role text NOT NULL CHECK(role IN ('manager','editor','viewer')), PRIMARY KEY(project_id,user_id));
        CREATE TABLE IF NOT EXISTS prism_project_sessions (session_id text PRIMARY KEY, project_id text NOT NULL REFERENCES prism_projects(id));
        CREATE TABLE IF NOT EXISTS prism_login_attempts (key text PRIMARY KEY, failures integer NOT NULL, until_ms bigint NOT NULL);
        CREATE TABLE IF NOT EXISTS prism_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text, action text NOT NULL, subject_id text NOT NULL, at timestamptz NOT NULL DEFAULT now());`)
      // Serialize bootstrap across concurrent starts; passwords are never reset on restart.
      await db.query('LOCK TABLE prism_users IN EXCLUSIVE MODE')
      if (!(await db.query('SELECT id FROM prism_users LIMIT 1')).rows.length) {
        const salt = randomBytes(16).toString('hex')
        const hash = (await hashPassword('admin', salt)).toString('hex')
        await db.query(
          "INSERT INTO prism_users(id,username,username_key,salt,hash,role) VALUES($1,'admin','admin',$2,$3,'admin')",
          [randomUUID(), salt, hash],
        )
      }
      await this.initializePermissions(db)
      if (
        !(
          await db.query(
            "SELECT version FROM prism_schema_migrations WHERE version='native-scans-v1'",
          )
        ).rows.length
      ) {
        await db.query(
          "INSERT INTO prism_role_permissions VALUES('member','scan.run','*') ON CONFLICT DO NOTHING",
        )
        await db.query("INSERT INTO prism_schema_migrations VALUES('native-scans-v1')")
      }
      await db.query(`CREATE TABLE IF NOT EXISTS prism_personal_sessions (
        session_id text PRIMARY KEY, user_id text NOT NULL REFERENCES prism_users(id),
        workspace_id text NOT NULL, root_path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now());`)
      if (
        !(
          await db.query(
            "SELECT version FROM prism_schema_migrations WHERE version='independent-tasks-v1'",
          )
        ).rows.length
      ) {
        await db.query(
          "INSERT INTO prism_role_permissions VALUES('admin','task.use','*'),('member','task.use','*') ON CONFLICT DO NOTHING",
        )
        await db.query(
          "UPDATE prism_roles SET description='可直接使用功能和创建项目；其他权限按需授予' WHERE id='member' AND builtin AND description='可创建项目；其他权限按需授予'",
        )
        await db.query("INSERT INTO prism_schema_migrations VALUES('independent-tasks-v1')")
      }
    })
    await this.refresh()
  }
  private async initializePermissions(db: SqlConnection) {
    await db.query(`CREATE TABLE IF NOT EXISTS prism_roles (id text PRIMARY KEY, name text NOT NULL UNIQUE, description text NOT NULL DEFAULT '', builtin boolean NOT NULL DEFAULT false);
      CREATE TABLE IF NOT EXISTS prism_role_permissions (role_id text NOT NULL REFERENCES prism_roles(id), permission text NOT NULL, resource text NOT NULL, PRIMARY KEY(role_id,permission,resource));
      CREATE TABLE IF NOT EXISTS prism_user_roles (user_id text NOT NULL REFERENCES prism_users(id), role_id text NOT NULL REFERENCES prism_roles(id), PRIMARY KEY(user_id,role_id));
      CREATE TABLE IF NOT EXISTS prism_user_permissions (user_id text NOT NULL REFERENCES prism_users(id), permission text NOT NULL, resource text NOT NULL, effect text NOT NULL CHECK(effect IN ('allow','deny')), PRIMARY KEY(user_id,permission,resource));
      CREATE TABLE IF NOT EXISTS prism_schema_migrations (version text PRIMARY KEY);`)
    if (
      (await db.query("SELECT version FROM prism_schema_migrations WHERE version='permissions-v1'"))
        .rows.length
    )
      return
    await db.query(
      "INSERT INTO prism_roles VALUES ('admin','系统管理员','全部系统与资源权限',true),('member','普通用户','可创建项目；其他权限按需授予',true) ON CONFLICT DO NOTHING",
    )
    for (const permission of PERMISSIONS)
      await db.query('INSERT INTO prism_role_permissions VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [
        'admin',
        permission.key,
        '*',
      ])
    await db.query(
      "INSERT INTO prism_role_permissions VALUES('member','project.create','*') ON CONFLICT DO NOTHING",
    )
    await db.query(
      'INSERT INTO prism_user_roles SELECT id,role FROM prism_users ON CONFLICT DO NOTHING',
    )
    // Preserve existing access once, as explicit grants. Ownership is metadata after migration.
    await db.query(
      "INSERT INTO prism_user_permissions SELECT owner_id,'project.manage',id,'allow' FROM prism_projects ON CONFLICT DO NOTHING",
    )
    await db.query(
      "INSERT INTO prism_user_permissions SELECT user_id,CASE role WHEN 'manager' THEN 'project.manage' WHEN 'editor' THEN 'project.run' ELSE 'project.read' END,project_id,'allow' FROM prism_members ON CONFLICT DO NOTHING",
    )
    await db.query("INSERT INTO prism_schema_migrations VALUES('permissions-v1')")
  }
  async refresh() {
    const next = this.refreshTail.catch(() => undefined).then(() => this.readSnapshot())
    this.refreshTail = next
    await next
  }
  private async readSnapshot() {
    // Commit all snapshots together. On failure expose no stale authorization state.
    try {
      const [
        users,
        projects,
        sessions,
        roles,
        rolePermissions,
        userRoles,
        userPermissions,
        personalSessions,
      ] = await Promise.all([
        this.db.query<TeamUser>(`SELECT ${USER_FIELDS} FROM prism_users`),
        this.db.query<TeamProject>('SELECT * FROM prism_projects'),
        this.db.query<ProjectSession>('SELECT * FROM prism_project_sessions'),
        this.db.query<AccessRole>('SELECT * FROM prism_roles ORDER BY builtin DESC, name'),
        this.db.query<RolePermission>('SELECT * FROM prism_role_permissions'),
        this.db.query<UserRoleBinding>('SELECT * FROM prism_user_roles'),
        this.db.query<UserPermission>('SELECT * FROM prism_user_permissions'),
        this.db.query<PersonalSession>(
          'SELECT session_id,user_id,workspace_id,root_path FROM prism_personal_sessions ORDER BY created_at,session_id',
        ),
      ])
      this.users = users.rows
      this.projects = projects.rows
      this.sessions = sessions.rows
      this.personalSessions = personalSessions.rows
      this.roles = roles.rows
      this.rolePermissions = rolePermissions.rows
      this.userRoles = userRoles.rows
      this.userPermissions = userPermissions.rows
      for (const session of sessions.rows) this.knownSessions.add(session.session_id)
      for (const session of personalSessions.rows) this.knownSessions.add(session.session_id)
    } catch (error) {
      this.users = []
      this.projects = []
      this.sessions = []
      this.personalSessions = []
      this.roles = []
      this.rolePermissions = []
      this.userRoles = []
      this.userPermissions = []
      this.changed()
      throw error
    }
  }
  isManaged(sessionId: string) {
    return this.knownSessions.has(sessionId)
  }
  restrictedSession(sessionId: string) {
    if (!this.isManaged(sessionId)) return false
    const personal = this.personalSessions.find((session) => session.session_id === sessionId)
    if (personal) return this.users.find((user) => user.id === personal.user_id)?.role !== 'admin'
    const project = this.projects.find((p) =>
      this.sessions.some((s) => s.session_id === sessionId && s.project_id === p.id),
    )
    if (!project) return true
    return this.users.some(
      (user) => user.role !== 'admin' && this.can(user.id, 'project.run', project.id),
    )
  }
  user(id: string) {
    return this.users.find((user) => user.id === id && !user.disabled)
  }
  projectRole(userId: string, projectId: string): ProjectRole | undefined {
    const user = this.user(userId),
      project = this.projects.find((p) => p.id === projectId)
    if (!user || !project) return undefined
    if (this.can(userId, 'project.manage', projectId)) return 'manager'
    if (this.can(userId, 'project.run', projectId)) return 'editor'
    if (this.can(userId, 'project.read', projectId)) return 'viewer'
    return undefined
  }
  allows(userId: string, projectId: string, action: 'read' | 'write' | 'manage') {
    const role = this.projectRole(userId, projectId)
    return (
      !!role &&
      (action === 'read' || role === 'manager' || (action === 'write' && role === 'editor'))
    )
  }
  allowsSession(userId: string, sessionId: string, action: 'read' | 'write' | 'manage') {
    const personal = this.personalSessions.find((s) => s.session_id === sessionId)
    if (personal)
      return (
        this.user(userId)?.role === 'admin' ||
        (personal.user_id === userId && this.can(userId, 'task.use'))
      )
    const session = this.sessions.find((s) => s.session_id === sessionId)
    return !!session && this.allows(userId, session.project_id, action)
  }
  assertProject(userId: string, projectId: string, action: 'read' | 'write' | 'manage') {
    if (!this.allows(userId, projectId, action)) throw new TeamError(403, '无此项目的操作权限。')
    return this.projects.find((p) => p.id === projectId)!
  }
  assertAdmin(userId: string) {
    if (this.user(userId)?.role !== 'admin') throw new TeamError(403, '需要管理员权限。')
  }
  roleIds(userId: string) {
    return this.userRoles.filter((row) => row.user_id === userId).map((row) => row.role_id)
  }
  can(userId: string, permission: PermissionKey, resource = '*') {
    const user = this.user(userId)
    if (!user) return false
    if (user.role === 'admin') return true
    const roles = this.roleIds(userId)
    return permitted(
      permission,
      resource,
      this.rolePermissions.filter((row) => roles.includes(row.role_id)),
      this.userPermissions.filter((row) => row.user_id === userId),
    )
  }
  assertPermission(userId: string, permission: PermissionKey) {
    if (!this.can(userId, permission)) throw new TeamError(403, '没有此操作权限。')
  }
  async authenticate(token: string | undefined): Promise<TeamUser | undefined> {
    if (!token) return undefined
    const { rows } = await this.db.query<TeamUser>(
      `SELECT ${USER_FIELDS.split(', ')
        .map((f) => `u.${f}`)
        .join(
          ', ',
        )} FROM prism_users u JOIN prism_auth_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND NOT u.disabled`,
      [tokenKey(token), Date.now()],
    )
    return rows[0]
  }
  async login(username: string, password: string, address: string) {
    if (username.length > 64 || password.length > 128) throw new TeamError(401, '账号或密码错误。')
    const usernameKey = username.trim().toLowerCase(),
      now = Date.now()
    const keys = [tokenKey(`ip:${address}`), tokenKey(`user:${usernameKey}`)]
    await this.db.transaction(async (db) => {
      await db.query('DELETE FROM prism_login_attempts WHERE until_ms<$1', [now])
      for (const key of keys) {
        const attempt = await db.query<{ failures: number }>(
          'INSERT INTO prism_login_attempts(key,failures,until_ms) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET failures=prism_login_attempts.failures+1 RETURNING failures',
          [key, now + 60000],
        )
        if (attempt.rows[0]!.failures > 5) throw new TeamError(429, '尝试过于频繁，请稍后再试。')
      }
    })
    const user = (
      await this.db.query<PasswordUser>('SELECT * FROM prism_users WHERE username_key=$1', [
        usernameKey,
      ])
    ).rows[0]
    const actual = await hashPassword(password, user?.salt ?? '00000000000000000000000000000000')
    if (!user || user.disabled || !timingSafeEqual(actual, Buffer.from(user.hash, 'hex')))
      throw new TeamError(401, '账号或密码错误。')
    await this.db.query('DELETE FROM prism_login_attempts WHERE key=ANY($1::text[])', [keys])
    return { user: publicUser(user), token: await this.issue(user.id) }
  }
  private async issue(userId: string) {
    const token = randomBytes(32).toString('base64url')
    await this.db.query('DELETE FROM prism_auth_sessions WHERE expires_at<$1', [Date.now()])
    await this.db.query('INSERT INTO prism_auth_sessions VALUES($1,$2,$3)', [
      tokenKey(token),
      userId,
      Date.now() + SESSION_MS,
    ])
    return token
  }
  async logout(token: string) {
    await this.db.query('DELETE FROM prism_auth_sessions WHERE token_hash=$1', [tokenKey(token)])
    this.changed()
  }
  async changePassword(userId: string, oldPassword: string, password: string) {
    validPassword(password)
    if (oldPassword.length > 128 || oldPassword === password)
      throw new TeamError(400, '请输入不同的新密码。')
    const salt = randomBytes(16).toString('hex'),
      hash = (await hashPassword(password, salt)).toString('hex')
    await this.db.transaction(async (db) => {
      const current = (
        await db.query<PasswordUser>('SELECT * FROM prism_users WHERE id=$1 FOR UPDATE', [userId])
      ).rows[0]
      if (
        !current ||
        current.disabled ||
        !timingSafeEqual(
          await hashPassword(oldPassword, current.salt),
          Buffer.from(current.hash, 'hex'),
        )
      )
        throw new TeamError(401, '当前密码错误。')
      await db.query('UPDATE prism_users SET salt=$2,hash=$3,must_change=false WHERE id=$1', [
        userId,
        salt,
        hash,
      ])
      await db.query('DELETE FROM prism_auth_sessions WHERE user_id=$1', [userId])
      await this.audit(db, userId, 'password-change', userId)
    })
    await this.refresh()
    this.changed()
    return await this.issue(userId)
  }
  async createUser(actor: string, username: string, password: string, role: UserRole) {
    this.assertPermission(actor, 'users.manage')
    if (role === 'admin') this.assertPermission(actor, 'permissions.manage')
    validPassword(password)
    if (!/^[\p{L}\p{N}_.@-]{2,64}$/u.test(username) || !['admin', 'member'].includes(role))
      throw new TeamError(400, '账号或角色无效。')
    const id = randomUUID(),
      salt = randomBytes(16).toString('hex'),
      hash = (await hashPassword(password, salt)).toString('hex')
    await this.db.transaction(async (db) => {
      await db.query(
        'INSERT INTO prism_users(id,username,username_key,salt,hash,role) VALUES($1,$2,$3,$4,$5,$6)',
        [id, username, username.toLowerCase(), salt, hash, role],
      )
      await db.query('INSERT INTO prism_user_roles VALUES($1,$2)', [id, role])
      await this.audit(db, actor, 'user-create', id)
    })
    await this.refresh()
    this.changed()
    return publicUser(this.users.find((u) => u.id === id)!)
  }
  async updateUser(
    actor: string,
    userId: string,
    role: UserRole,
    disabled: boolean,
    password?: string,
  ) {
    this.assertPermission(actor, 'users.manage')
    const target = this.users.find((user) => user.id === userId)
    if (target?.role === 'admin' && this.user(actor)?.role !== 'admin') this.assertAdmin(actor)
    if (target && target.role !== role) this.assertPermission(actor, 'permissions.manage')
    if (!['admin', 'member'].includes(role)) throw new TeamError(400, '角色无效。')
    if (password !== undefined) validPassword(password)
    const salt = password === undefined ? undefined : randomBytes(16).toString('hex')
    const hash =
      password === undefined ? undefined : (await hashPassword(password, salt!)).toString('hex')
    await this.db.transaction(async (db) => {
      await db.query('LOCK TABLE prism_users IN EXCLUSIVE MODE')
      const user = (
        await db.query<TeamUser>(`SELECT ${USER_FIELDS} FROM prism_users WHERE id=$1`, [userId])
      ).rows[0]
      if (!user) throw new TeamError(404, '用户不存在。')
      if (user.role === 'admin' && (disabled || role !== 'admin')) {
        const admins = (
          await db.query('SELECT id FROM prism_users WHERE role=$1 AND NOT disabled AND id<>$2', [
            'admin',
            userId,
          ])
        ).rows
        if (!admins.length) throw new TeamError(409, '至少保留一个启用的管理员。')
      }
      await db.query('UPDATE prism_users SET role=$2,disabled=$3 WHERE id=$1', [
        userId,
        role,
        disabled,
      ])
      if (user.role !== role) {
        await db.query(
          "DELETE FROM prism_user_roles WHERE user_id=$1 AND role_id IN ('admin','member')",
          [userId],
        )
        await db.query('INSERT INTO prism_user_roles VALUES($1,$2) ON CONFLICT DO NOTHING', [
          userId,
          role,
        ])
      }
      if (salt)
        await db.query('UPDATE prism_users SET salt=$2,hash=$3,must_change=true WHERE id=$1', [
          userId,
          salt,
          hash,
        ])
      await db.query('DELETE FROM prism_auth_sessions WHERE user_id=$1', [userId])
      await this.audit(db, actor, 'user-update', userId)
    })
    await this.refresh()
    this.changed()
  }
  async addProject(actor: string, project: TeamProject) {
    this.assertPermission(actor, 'project.create')
    if (!this.user(actor) || project.owner_id !== actor) throw new TeamError(403, '请先登录。')
    await this.db.transaction(async (db) => {
      await db.query('INSERT INTO prism_projects VALUES($1,$2,$3,$4,$5)', [
        project.id,
        project.name,
        actor,
        project.workspace_id,
        project.root_path,
      ])
      await db.query("INSERT INTO prism_user_permissions VALUES($1,'project.manage',$2,'allow')", [
        actor,
        project.id,
      ])
      await this.audit(db, actor, 'project-create', project.id)
    })
    await this.refresh()
    this.changed()
  }
  async addSession(actor: string, projectId: string, sessionId: string) {
    this.assertProject(actor, projectId, 'write')
    await this.db.query('INSERT INTO prism_project_sessions VALUES($1,$2)', [sessionId, projectId])
    await this.refresh()
    this.changed()
  }
  async addPersonalSession(
    actor: string,
    session: Pick<PersonalSession, 'session_id' | 'workspace_id' | 'root_path'>,
  ) {
    this.assertPermission(actor, 'task.use')
    await this.db.transaction(async (db) => {
      await db.query(
        'INSERT INTO prism_personal_sessions(session_id,user_id,workspace_id,root_path) VALUES($1,$2,$3,$4)',
        [session.session_id, actor, session.workspace_id, session.root_path],
      )
      await this.audit(db, actor, 'task-create', String(session.session_id))
    })
    await this.refresh()
    this.changed()
  }
  private validateGrant(grant: PermissionGrant) {
    const definition = PERMISSIONS.find((row) => row.key === grant.permission)
    if (
      !definition ||
      typeof grant.resource !== 'string' ||
      (definition.scope === 'system' && grant.resource !== '*') ||
      (definition.scope === 'project' &&
        grant.resource !== '*' &&
        !this.projects.some((row) => row.id === grant.resource))
    )
      throw new TeamError(400, '权限或资源无效。')
  }
  async saveRole(
    actor: string,
    input: { id?: string; name: string; description: string; grants: PermissionGrant[] },
  ) {
    this.assertPermission(actor, 'permissions.manage')
    if (input.id === 'admin') throw new TeamError(400, '系统管理员角色不可修改。')
    const name = input.name.trim(),
      description = input.description.trim()
    if (
      !name ||
      name.length > 64 ||
      description.length > 240 ||
      !Array.isArray(input.grants) ||
      input.grants.length > 500
    )
      throw new TeamError(400, '角色信息无效。')
    for (const grant of input.grants) this.validateGrant(grant)
    const id = input.id ?? randomUUID()
    if (input.id && !this.roles.some((row) => row.id === id))
      throw new TeamError(404, '角色不存在。')
    await this.db.transaction(async (db) => {
      if (input.id)
        await db.query('UPDATE prism_roles SET name=$2,description=$3 WHERE id=$1', [
          id,
          name,
          description,
        ])
      else
        await db.query('INSERT INTO prism_roles(id,name,description) VALUES($1,$2,$3)', [
          id,
          name,
          description,
        ])
      await db.query('DELETE FROM prism_role_permissions WHERE role_id=$1', [id])
      for (const grant of input.grants)
        await db.query(
          'INSERT INTO prism_role_permissions VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, grant.permission, grant.resource],
        )
      await this.audit(db, actor, 'role-save', id)
    })
    await this.refresh()
    this.changed()
    return { id }
  }
  async setUserRoles(actor: string, userId: string, roleIds: string[]) {
    this.assertPermission(actor, 'permissions.manage')
    if (
      !Array.isArray(roleIds) ||
      roleIds.length > 32 ||
      roleIds.some((id) => !this.roles.some((row) => row.id === id))
    )
      throw new TeamError(400, '角色无效。')
    const role = roleIds.includes('admin') ? 'admin' : 'member'
    await this.db.transaction(async (db) => {
      await db.query('LOCK TABLE prism_users IN EXCLUSIVE MODE')
      const user = (await db.query<TeamUser>('SELECT * FROM prism_users WHERE id=$1', [userId]))
        .rows[0]
      if (!user) throw new TeamError(404, '用户不存在。')
      if (
        user.role === 'admin' &&
        role !== 'admin' &&
        !(
          await db.query(
            "SELECT id FROM prism_users WHERE role='admin' AND NOT disabled AND id<>$1",
            [userId],
          )
        ).rows.length
      )
        throw new TeamError(409, '至少保留一个启用的管理员。')
      await db.query('UPDATE prism_users SET role=$2 WHERE id=$1', [userId, role])
      await db.query('DELETE FROM prism_user_roles WHERE user_id=$1', [userId])
      for (const roleId of new Set(roleIds))
        await db.query('INSERT INTO prism_user_roles VALUES($1,$2)', [userId, roleId])
      await db.query('DELETE FROM prism_auth_sessions WHERE user_id=$1', [userId])
      await this.audit(db, actor, 'user-roles', userId)
    })
    await this.refresh()
    this.changed()
  }
  async setUserPermission(
    actor: string,
    userId: string,
    grant: PermissionGrant,
    effect: 'allow' | 'deny' | null,
  ) {
    this.assertPermission(actor, 'permissions.manage')
    if (!this.users.some((row) => row.id === userId)) throw new TeamError(404, '用户不存在。')
    if (this.users.find((row) => row.id === userId)?.role === 'admin')
      throw new TeamError(400, '系统管理员使用完整权限，无需配置例外。')
    this.validateGrant(grant)
    if (effect !== null && effect !== 'allow' && effect !== 'deny')
      throw new TeamError(400, '授权方式无效。')
    await this.db.transaction(async (db) => {
      if (effect)
        await db.query(
          'INSERT INTO prism_user_permissions VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission,resource) DO UPDATE SET effect=$4',
          [userId, grant.permission, grant.resource, effect],
        )
      else
        await db.query(
          'DELETE FROM prism_user_permissions WHERE user_id=$1 AND permission=$2 AND resource=$3',
          [userId, grant.permission, grant.resource],
        )
      await this.audit(
        db,
        actor,
        effect ? `permission-${effect}` : 'permission-reset',
        `${userId}/${grant.permission}/${grant.resource}`,
      )
    })
    await this.refresh()
    this.changed()
  }
  private async audit(db: SqlConnection, actor: string, action: string, subject: string) {
    await db.query('INSERT INTO prism_audit(actor_id,action,subject_id) VALUES($1,$2,$3)', [
      actor,
      action,
      subject,
    ])
  }
}
