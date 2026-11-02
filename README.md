# DSH Red Team · 棱镜 DSH 插件版

这是棱镜最后以 **DeepSeek Harness（DSH）作为默认运行入口** 的独立公开源码快照。

- 插件包：`@prism-ai/dsh-redteam`，版本 `1.4.0`。
- 固定适配：DSH `0.2.1-rc.2`，不表示兼容其他版本或今天的 npm latest。
- 来源提交：`c938e605e2182735d69b9e7170a86934328f53a3`（2026-10-29）。紧随其后的版本将默认部署切换到独立应用，本仓库保留切换前状态。
- 这是历史开发快照，不是 `BATE1.0` 正式版本。导出时保留原有功能代码与 MIT 许可证，仅整理公开仓库文档并移除本机截图路径。详见 [快照说明](doc/snapshot.md)。

## 获取源码

```bash
git clone https://github.com/spkiddai/dsh-redteam.git
cd dsh-redteam
```

建议使用 Node.js 24 和 `pnpm@11.19.0`。Docker Compose 是默认运行方式，命令见下文。数据库、密钥、用户数据均由部署时在本机生成，不包含在源码中。

## 运行边界

默认 `Dockerfile` 和 `compose.yml` 启动 DSH，模型、会话、MCP、工具调用及审批由 DSH 提供。`src/server/`、`src/client/standalone/` 中同时保留当时的实验性独立运行代码，不能据此认为独立 Agent、外部 MCP 或旧会话迁移已完成。

本仓库不包含后续棱镜核心、蓝队系统与统一红蓝工作台，也不要求访问其他私有仓库。历史文档中的平台名称、界面描述和验证记录反映当时状态，不代表当前重新验证的结果。

## 原 DSH 版本与部署

插件直接使用 DSH 的模型、会话、工作区、沙箱、审批和 MCP 能力，不实现第二套 Agent。登录网关和棱镜专用界面仍附着于同一 DSH 插件。
本快照版本为 `1.4.0`，固定支持 DeepSeek Harness `0.2.1-rc.2`。

参考 Strix 新增检查覆盖台账、结构化验证证据和报告完整性提示，详见 [设计吸收记录](doc/strix-design.md)。

## 核心能力

- 账号密码登录、棱镜专用工作台，以及 Docker Compose 部署。
- 原生 HTTP/TLS 漏洞扫描：17 条原创规则、自定义规则、数据库任务队列、暂停/继续、复测、漏洞处置与 HTML/JSON 报告。可直接输入目标，无需项目或模型密钥，详见 [原生漏扫](doc/native-scanner.md)。
- 原生 TCP 端口扫描：IP/域名、端口列表与范围、并发控制、状态对比及报告；入口为可展开的「安全工具 → 内置扫描」。
- 信息收集、主动扫描、漏洞验证、全部允许四档执行权限。
- 目标范围硬限制：只有勾选并确认的资产可以测试。
- 可选的外部安全工具 MCP 接入与 AI 权限建议；原生漏洞扫描不依赖这些连接。
- 本地项目记忆、长期知识检索、资产图和漏洞报告。
- HTML、Word、Markdown、JSON、XML、SARIF 等输出格式。

## Docker Compose 启动

```bash
node scripts/prepare-compose.mjs
docker compose up -d --build
```

打开 <http://127.0.0.1:3080/>，默认管理员 `admin/admin`，登录后仅提示建议修改初始密码。Compose 包含 PostgreSQL；用户管理与权限管理是独立页面。账号按角色授权，可单独增加或拒绝权限，项目是可授权资源之一。详见 [容器部署](doc/container.md) 和 [权限模型](doc/permissions.md)。

## 本地 Node 启动

```bash
pnpm install
pnpm build
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add .
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web exec dsh-redteam install --profile web
pnpm dlx @deepseek-ai/dsh@0.2.1-rc.2 web
```

请打开启动后打印的“棱镜”地址，使用默认管理员 `admin/admin` 登录；可按提示自行修改初始密码。登录后自动进入棱镜，无需切换 DSH 模式。

完整说明见 [doc/README.md](doc/README.md)。

> 仅可对已获得明确授权的目标进行测试。执行权限不会扩大目标范围，也不会绕过 DSH 的沙箱和安全策略。
