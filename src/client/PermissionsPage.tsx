import { useEffect, useState } from 'react'
import { IconPlusOutlineMedium } from './primitives.js'
import {
  PERMISSIONS,
  permitted,
  type PermissionGrant,
  type PermissionKey,
} from '../lib/permissions.js'
import { teamApi, type TeamView } from './team-api.js'
import { PageHeading } from './ManagementPages.js'

function PermissionMatrix({
  state,
  grants,
  change,
  disabled,
}: {
  state: TeamView
  grants: PermissionGrant[]
  change(value: PermissionGrant[]): void
  disabled: boolean
}) {
  const toggle = (permission: PermissionKey, resource: string) =>
    change(
      grants.some((row) => row.permission === permission && row.resource === resource)
        ? grants.filter((row) => row.permission !== permission || row.resource !== resource)
        : [...grants, { permission, resource }],
    )
  const box = (key: PermissionKey, resource: string, label: string) => (
    <input
      aria-label={label}
      type="checkbox"
      disabled={disabled}
      checked={grants.some((row) => row.permission === key && row.resource === resource)}
      onChange={() => toggle(key, resource)}
    />
  )
  return (
    <div className="prism-permission-matrix">
      <h3>功能权限</h3>
      <div className="prism-permission-options">
        {PERMISSIONS.filter((row) => row.scope === 'system').map((row) => (
          <label key={row.key}>
            {box(row.key, '*', row.label)}
            <span>
              {row.label}
              <small>{row.group}</small>
            </span>
          </label>
        ))}
      </div>
      <h3>项目资源</h3>
      <p className="prism-muted">
        管理包含执行与查看，执行包含查看。选择“全部项目”会覆盖当前和以后创建的项目。
      </p>
      <div className="prism-table-scroll">
        <table className="prism-table">
          <thead>
            <tr>
              <th>资源范围</th>
              <th>查看</th>
              <th>执行</th>
              <th>管理</th>
            </tr>
          </thead>
          <tbody>
            {[{ id: '*', name: '全部项目' }, ...(state.permissions?.resources ?? [])].map(
              (resource) => (
                <tr key={resource.id}>
                  <td>{resource.name}</td>
                  {(['project.read', 'project.run', 'project.manage'] as const).map((key) => (
                    <td key={key}>
                      {box(
                        key,
                        resource.id,
                        resource.name + ' ' + PERMISSIONS.find((row) => row.key === key)!.label,
                      )}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export function PermissionsPage({
  state,
  refresh,
  initialUser,
}: {
  state: TeamView
  refresh(): Promise<void>
  initialUser?: string
}) {
  const [tab, setTab] = useState<'roles' | 'users'>(initialUser ? 'users' : 'roles'),
    [roleId, setRoleId] = useState('member'),
    [userId, setUserId] = useState(initialUser ?? state.users[0]?.id ?? '')
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [grants, setGrants] = useState<PermissionGrant[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]),
    [permission, setPermission] = useState<PermissionKey>('project.read'),
    [resource, setResource] = useState('*'),
    [effect, setEffect] = useState('allow')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const selectedRole = state.roles.find((role) => role.id === roleId),
    user = state.users.find((row) => row.id === userId)
  useEffect(() => {
    setName(selectedRole?.name ?? '')
    setDescription(selectedRole?.description ?? '')
    setGrants(selectedRole?.grants ?? [])
  }, [selectedRole])
  useEffect(() => {
    setSelectedRoles(user?.roleIds ?? [])
  }, [user])
  useEffect(() => {
    if (initialUser) {
      setUserId(initialUser)
      setTab('users')
    }
  }, [initialUser])
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      await refresh()
      setNotice('已保存，权限立即生效。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。')
    } finally {
      setBusy(false)
    }
  }
  const overrides =
    user?.role === 'admin'
      ? []
      : (state.permissions?.overrides.filter((row) => row.user_id === userId) ?? [])
  const inherited = state.roles
    .filter((role) => user?.roleIds.includes(role.id))
    .flatMap((role) => role.grants)
  const isProject = PERMISSIONS.find((row) => row.key === permission)?.scope === 'project'
  return (
    <div className="prism-page">
      <PageHeading
        eyebrow="ROLES & ACCESS"
        title="权限管理"
        description="角色定义通用权限，用户例外用于单独增加或拒绝。项目是可授权资源之一。"
      >
        <button
          className="prism-button primary"
          onClick={() => {
            setTab('roles')
            setRoleId('')
            setName('')
            setDescription('')
            setGrants([])
            setNotice('')
          }}
        >
          <IconPlusOutlineMedium />
          新建角色
        </button>
      </PageHeading>
      <div className="prism-page-tabs" role="tablist" aria-label="权限管理视图">
        <button
          role="tab"
          aria-selected={tab === 'roles'}
          onClick={() => {
            setTab('roles')
            setNotice('')
          }}
        >
          角色权限<span>{state.roles.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'users'}
          onClick={() => {
            setTab('users')
            setNotice('')
          }}
        >
          用户授权与例外
        </button>
      </div>
      {error && (
        <div role="alert" className="prism-inline-message error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="prism-inline-message success">
          {notice}
        </div>
      )}
      {tab === 'roles' ? (
        <div className="prism-access-layout">
          <aside className="prism-surface prism-role-list">
            <h2>角色列表</h2>
            {state.roles.map((role) => (
              <button
                key={role.id}
                className={roleId === role.id ? 'active' : ''}
                onClick={() => {
                  setRoleId(role.id)
                  setNotice('')
                }}
              >
                <strong>{role.name}</strong>
                <small>
                  {role.builtin ? '内置角色' : '自定义角色'} ·{' '}
                  {state.users.filter((row) => row.roleIds.includes(role.id)).length} 位用户
                </small>
              </button>
            ))}
          </aside>
          <section className="prism-surface prism-role-editor">
            <div className="prism-surface-heading">
              <div>
                <h2>{selectedRole ? selectedRole.name : '新建角色'}</h2>
                <p>
                  {roleId === 'admin'
                    ? '系统内置完整权限，不能修改。'
                    : '保存后，所有使用此角色的用户同步生效。'}
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  const saved = await teamApi<{ id: string }>('role-save', {
                    ...(roleId ? { id: roleId } : {}),
                    name,
                    description,
                    grants,
                  })
                  setRoleId(saved.id)
                })
              }}
            >
              <fieldset disabled={busy || roleId === 'admin'} className="prism-reset-fieldset">
                <div className="prism-form-grid">
                  <label>
                    角色名称
                    <input
                      required
                      maxLength={64}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="例如：安全分析师"
                    />
                  </label>
                  <label>
                    角色说明
                    <input
                      maxLength={240}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="描述这个角色的工作范围"
                    />
                  </label>
                </div>
                <PermissionMatrix
                  state={state}
                  grants={grants}
                  change={setGrants}
                  disabled={busy || roleId === 'admin'}
                />
                <div className="prism-editor-footer">
                  <span>{grants.length} 项授权</span>
                  <button className="prism-button primary">
                    {busy ? '保存中…' : '保存角色权限'}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      ) : (
        <div className="prism-user-access">
          <section className="prism-surface prism-access-subject">
            <label>
              选择用户
              <select
                className="prism-select"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  setNotice('')
                }}
              >
                {state.users.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.username}
                    {row.disabled ? '（已停用）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p>角色权限与用户例外共同决定实际访问。明确拒绝优先于允许。</p>
          </section>
          {user && (
            <>
              <section className="prism-surface prism-role-editor">
                <div className="prism-surface-heading">
                  <div>
                    <h2>分配角色</h2>
                    <p>可以分配多个角色，也可以不分配任何角色。</p>
                  </div>
                  <button
                    className="prism-button primary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => teamApi('user-roles', { userId, roleIds: selectedRoles }))
                    }
                  >
                    保存角色分配
                  </button>
                </div>
                <div className="prism-role-choice">
                  {state.roles.map((role) => (
                    <label key={role.id}>
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.id)}
                        disabled={busy}
                        onChange={(event) =>
                          setSelectedRoles(
                            event.target.checked
                              ? [...selectedRoles, role.id]
                              : selectedRoles.filter((id) => id !== role.id),
                          )
                        }
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>{role.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="prism-surface prism-role-editor">
                <div className="prism-surface-heading">
                  <div>
                    <h2>用户单独授权</h2>
                    <p>
                      {user.role === 'admin'
                        ? '系统管理员拥有完整权限，无需配置例外。'
                        : '增加权限、明确拒绝，或恢复为角色继承。'}
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(() =>
                      teamApi('permission-set', {
                        userId,
                        permission,
                        resource: isProject ? resource : '*',
                        effect: effect === 'inherit' ? null : effect,
                      }),
                    )
                  }}
                >
                  <fieldset
                    className="prism-reset-fieldset"
                    disabled={busy || user.role === 'admin'}
                  >
                    <div className="prism-grant-form">
                      <label>
                        权限项
                        <select
                          value={permission}
                          onChange={(event) => setPermission(event.target.value as PermissionKey)}
                        >
                          {PERMISSIONS.map((row) => (
                            <option key={row.key} value={row.key}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        资源范围
                        <select
                          value={isProject ? resource : '*'}
                          disabled={!isProject}
                          onChange={(event) => setResource(event.target.value)}
                        >
                          <option value="*">{isProject ? '全部项目' : '系统范围'}</option>
                          {isProject &&
                            state.permissions?.resources.map((row) => (
                              <option value={row.id} key={row.id}>
                                {row.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        授权方式
                        <select value={effect} onChange={(event) => setEffect(event.target.value)}>
                          <option value="allow">单独允许</option>
                          <option value="deny">明确拒绝</option>
                          <option value="inherit">恢复角色继承</option>
                        </select>
                      </label>
                      <button className="prism-button primary">保存例外</button>
                    </div>
                  </fieldset>
                </form>
                <div className="prism-table-scroll">
                  <table className="prism-table">
                    <thead>
                      <tr>
                        <th>权限项</th>
                        <th>资源范围</th>
                        <th>用户例外</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overrides.map((row) => (
                        <tr key={row.permission + row.resource}>
                          <td>{PERMISSIONS.find((p) => p.key === row.permission)?.label}</td>
                          <td>
                            {row.resource === '*'
                              ? '全部范围'
                              : state.permissions?.resources.find((r) => r.id === row.resource)
                                  ?.name}
                          </td>
                          <td>
                            <span
                              className={
                                'prism-tag ' + (row.effect === 'deny' ? 'prism-tag-red' : '')
                              }
                            >
                              {row.effect === 'deny' ? '明确拒绝' : '单独允许'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="prism-text-button"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  teamApi('permission-set', {
                                    userId,
                                    permission: row.permission,
                                    resource: row.resource,
                                    effect: null,
                                  }),
                                )
                              }
                            >
                              恢复继承
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!overrides.length && (
                    <p className="prism-table-empty">没有单独配置，使用角色权限。</p>
                  )}
                </div>
              </section>
              <section className="prism-surface prism-role-editor">
                <div className="prism-surface-heading">
                  <div>
                    <h2>当前生效权限</h2>
                    <p>按上方选定资源查看实际权限；已停用账号无访问权限。</p>
                  </div>
                </div>
                <div className="prism-effective-grid">
                  {PERMISSIONS.map((row) => {
                    const allowed =
                      !user.disabled &&
                      (user.role === 'admin' ||
                        permitted(
                          row.key,
                          row.scope === 'system' ? '*' : resource,
                          inherited,
                          overrides,
                        ))
                    return (
                      <div key={row.key}>
                        <span>{row.label}</span>
                        <span className={'prism-status ' + (allowed ? 'positive' : 'muted')}>
                          {allowed ? '允许' : '未授权'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
