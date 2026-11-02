# 安装与启动

## 环境要求

- Node.js `22.19+` 或 `24+`
- pnpm `11.19+`
- DeepSeek Harness `0.2.1-rc.2`

插件只兼容上述最新版 DSH，不包含旧版 API 回退。

## 从源码安装

在项目根目录执行：

```bash
corepack enable
pnpm install
pnpm build
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add .
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web exec dsh-redteam install --profile web
```

第一条 DSH 命令把插件作为普通依赖加入 Web profile；第二条命令安装“红队模式”Preset，并激活看板
入口。安装器是保护式的：相同内容可以重复执行，发现用户改过的同名 Preset 或冲突配置时会停止，
不会直接覆盖。

## 从打包文件安装

```bash
pnpm pack
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add ./prism-ai-dsh-redteam-1.4.0.tgz
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web exec dsh-redteam install --profile web
```

插件不声明 `dsh.bundle`；被作为普通依赖安装是预期行为。

## 启动 Web 服务

```bash
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 web --port 3080
```

启动后打印 `棱镜: http://127.0.0.1:3080/`。空数据库自动初始化 `admin / admin`，首次登录后只提示建议修改初始密码，不强制跳转。
浏览器不会收到原 DSH 临时 Token。登录状态 8 小时有效，退出、修改密码或停用账号会撤销登录。
本地默认使用 `$DSH_HOME/prism-auth/database` 内的 PGlite 数据库；Compose 使用 PostgreSQL。
设置 `PRISM_DATABASE_URL` 可连接独立 PostgreSQL，连接失败时不会自动切换数据库。

登录后直接进入任务工作台。侧栏可独立打开资产情况、漏洞汇总和工具集成，无需先创建项目；在模块顶部切换“查看范围”即可查看某个项目。任务记录由系统自动准备。用户管理与权限管理保持独立；项目是可选的协作资源。会话固定使用
`redteam` Preset，旧 DSH 模式和侧栏不再显示。使用模型前，通过 DSH 支持的环境变量配置模型凭据，
例如 `DEEPSEEK_API_KEY`；不要把凭据写入仓库。

容器启动、持久化、端口和反向代理见 [Docker Compose 部署](container.md)。

## 更新

更新时重新拉取当前最新版源码、安装依赖、构建和打包，再将新包加入 profile。由于项目只支持最新
DSH，插件版本和所有 `@deepseek-ai/dsh-*` 依赖必须一起升级并重新完成兼容性测试。

本版本仅支持 npm `latest` 对应的 DSH `0.2.1-rc.2`，不支持旧版本或 `next` 渠道。
安装器不读取旧 `.agent-presets` 目录，也不提供 `install-preset` 命令。已有同名插件项或手工修改过的
预设需要先备份并整理 profile 配置，然后重新执行安装命令。

用户数据位于工作区的 `.dsh-redteam/`，正常升级不会删除它。

## 卸载

先从 Web profile 的 `cordis.patch.yml` 中移除 `# BEGIN dsh-redteam managed preset` 到
`# END dsh-redteam managed preset` 的完整区块（包括插件、预设和 Web 覆盖配置），再执行：

```bash
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web remove @prism-ai/dsh-redteam
```

卸载不会自动删除工作区中的 `.dsh-redteam/`。如需清理数据，应在确认不再需要历史项目和报告后由
用户自行处理。

## 常见问题

### 没有登录页或棱镜界面

确认已经执行 `dsh-redteam install --profile web`，并重启服务。打开打印的“棱镜”地址。
确认 Web profile 的 managed preset 区块完整，包含私有原生监听端口、默认 redteam 模式和登录插件。

### 本地安全工具显示不可用

MCP 适配器会启动，但不会下载第三方工具。请在运行 DSH 的同一环境中安装对应命令，确保它位于
`PATH`，或使用 `PRISM_*_BIN` 环境变量指定位置。详细说明见 [MCP 安全工具](mcp-tools.md)。
