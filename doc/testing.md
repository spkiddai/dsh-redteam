# 测试与发布

## 本地质量门禁

提交或交付前执行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm pack --dry-run
```

## 测试范围

- 领域逻辑：范围、脱敏、规则扫描、稳定 Finding ID、状态迁移和多格式报告。
- 资产图：类型规范化、关系合并、广度优先队列、来源约束、容量限制与导出。
- 执行策略：工具确认、四档等级、逐步审批、域名/IP/CIDR/URL 范围和越界拒绝，以及未知 MCP 默认拒绝和 IP 全端口确认。
- AI MCP 权限：元数据读取、未确认建议、用户确认、显式启用、目标提取、越界拒绝、低等级审批、Schema 变化失效、重载恢复和前端评估重试。
- 会话设置：私有文件、会话隔离、插件重载后恢复、无凭证 MCP 定义校验、真实本地 HTTP MCP 连接和工具发现。
- MCP 工具：参数校验、命令发现、无 Shell 启动、超时、输出截断和四个适配器。
- 知识库：项目事件、晋升、L0/L1/L2、URI、FTS5 重建、并发锁和符号链接拒绝。
- Cordis 集成：唯一插件入口、redteam Agent scope、二十一个工具、覆盖台账读写、Prompt、下游策略和卸载。
- 团队权限：数据库初始化、可忽略改密提示、8 位密码、独立账号、角色组合、资源授权、用户允许/拒绝与恢复继承、一次性授权迁移、最后管理员保护、DSH 非 owner 权限、审批事件过滤、WebSocket 撤权断开。
- 报告可信度：覆盖条目更新、跨评估引用拒绝、验证证据要求、六种报告格式的限制说明。
- 客户端：四个模块、模型切换、Token/缓存/费用指标、目标范围、工具确认、执行详情和空状态文案，以及旧会话异步响应隔离和 Finding 状态更新。
- 安装器：声明式 Preset 注册、profile 原子更新、幂等安装和拒绝覆盖用户配置。

## 最新版 DSH 兼容性

兼容目标固定为 DeepSeek Harness `0.2.1-rc.2`。`package.json` 中相关 peer 与开发依赖使用精确版本，
客户端和 Host 不保留旧版 API 分支。

`patches/dsh-client-ui-workspace-0.2.1-rc.2.patch` 只补充上游声明文件遗漏的 toast 类型导出，
保持 `skipLibCheck: false`，不修改 DSH 运行时代码。开发安装跳过与插件无关的 LibreOffice 可选
平台载荷；原生构建工具仍正常安装。客户端采用新版 `sessions.using()` 引用生命周期、
`retainedBy.mainView` 当前会话、`uiWorkspace.openSession()` 导航和专用 `root` Slot。

每次 DSH 升级必须：

1. 更新所有 `@deepseek-ai/dsh-*` 精确依赖。
2. 完成格式、Lint、类型、单测、覆盖率和构建检查。
3. 生成真实 tarball。
4. 把 tarball 安装到全新的临时 DSH profile。
5. 运行插件安装器并检查 `--dump-config`。
6. 启动 Web 服务，使用本次打印的棱镜地址，验证 admin/admin 初始化、可忽略改密提示、8 位密码、登录、退出与接口保护。
7. 验证版本号、红队模式、看板、MCP 服务和浏览器控制台。

验证目标是“只兼容最新版本”，不应为了通过旧版测试重新加入兼容分支。

## 发布物检查

发布包允许包含：

- `dist/**/*.js` 与声明文件。
- 客户端 bundle 及 source map。
- `tools/dist/` MCP 服务产物。
- `preset/**/*.yml`。
- 部署模板。
- 根 README、`doc/**/*.md`、`tools/README.md`、LICENSE 和 package manifest。

不得包含源码测试、coverage、`.dsh-redteam`、`.prism`、`.env`、临时 profile、凭证或上游 DSH 源码。

打包后建议再检查一次文件清单，并确认 `dsh-redteam` 与 `dsh-redteam-mcp` 两个可执行入口存在。

新增登录测试覆盖数据库哈希保存、重复初始化、限流、会话撤销、跨站请求、HTTP 资源与 WebSocket 连接。
容器部署须验证 `docker compose config --quiet`、构建、健康检查和持久化重启。

## 2026-10-26 验证记录

- Node `24.22.1`，DSH `0.2.1-rc.2`，插件 `1.4.0`。
- 27 个测试文件、171 项测试通过；行覆盖率 91.97%，分支覆盖率 81.38%。
- `format:check`、`lint`、`typecheck`、`test`、`test:coverage`、`build`、`pack --dry-run` 通过。
- 产物安装到全新隔离 Web profile；`--dump-config` 确认原生端口私有、默认 redteam、旧预设禁用。
- 实际浏览器验证登录、独立用户和权限管理页面、概览、项目与工作台；原生 Agent 注册全部 21 个红队工具，MCP 服务启动。
- 浏览器验证 `admin/admin` 登录直接进入工作台；改密建议可以关闭，8 位密码可设置，7 位密码被拒绝。
- Compose 镜像构建和两个服务的健康检查通过；默认管理员登录成功，数据库不映射宿主机端口。
- PostgreSQL 18 独立测试 schema 验证初始化、授权、撤权、事务回滚和重新加载后持久化。
- 隔离容器 profile 中使用真实 DSH HTTP 接口验证：项目与会话创建、角色授权、角色变更撤销登录、管理员访问全部、用户间列表/历史/策略隔离、只读用户写入被拒绝、用户例外拒绝与恢复继承、角色撤权即时生效。项目管理者不能绕过权限管理授权，旧成员授权接口已关闭。
- 容器入口将镜像管理的依赖复制到物理 profile 路径，避免根目录链接或 `--preserve-symlinks` 破坏 DSH 的模块身份和 Agent scope；仅替换带标记的程序依赖，不删除账号、会话和项目数据。
- 未配置模型 API Key，因此没有进行真实模型请求或外部扫描。
