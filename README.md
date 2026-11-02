# dsh-redteam

`dsh-redteam` 是 DeepSeek Harness（DSH）的单插件红队评估扩展。它复用 DSH 的模型、会话、
工作区、沙箱、审批和 MCP 能力，为已获授权的项目提供资产测绘、范围控制、安全扫描、
非破坏性验证、知识沉淀和报告输出。

当前版本：`1.3.2`；兼容 DeepSeek Harness `0.1.2-alpha.5`。

这是没有棱镜独立登录页的 DSH 插件版本，直接使用 DSH 的认证和运行环境。
默认代码已按用户要求恢复到 `v1.3.2`，版本来源和范围见 [快照说明](doc/snapshot.md)。

> **使用声明：本项目仅用于合法、已授权的安全研究与测试，禁止用于任何非法用途。**

## 功能

- DSH 原生“红队模式”和 PRISM 看板
- 信息收集、主动扫描、漏洞验证、全部允许四档执行权限
- 目标范围硬限制：仅测试用户明确勾选并确认的资产
- Nmap、Nuclei、Burp Suite、Metasploit 本地工具适配
- 本地项目记忆、长期知识检索和资产关系图
- HTML、Word、Markdown、JSON、XML、SARIF 报告
- 凭据与敏感证据脱敏，持久化内容有界

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.19.0`
- DeepSeek Harness `0.1.2-alpha.5`
- 可选：Nmap、Nuclei、Burp Suite、Metasploit（使用对应适配器时需要）

## 本地打包安装

先按下文从源码构建，再生成安装包（本仓库尚未提供 Release 附件）：

```bash
mkdir -p release
pnpm pack --pack-destination release
pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.5 plugin --profile web add ./release/prism-ai-dsh-redteam-1.3.2.tgz
pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.5 plugin --profile web exec dsh-redteam install --profile web
pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.5 web
```

使用最后一条命令输出的完整认证地址打开页面，在新会话中选择“红队模式”。

## 从源码构建

```bash
git clone https://github.com/spkiddai/dsh-redteam.git
cd dsh-redteam
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

构建结果位于 `dist/` 和 `tools/dist/`。安装本地构建：

```bash
pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.5 plugin --profile web add .
pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.5 plugin --profile web exec dsh-redteam install --profile web
```

## 验证与打包

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm pack
```

完整检查也可以一次执行：

```bash
pnpm check
```

## 目录结构

```text
src/              插件、客户端和核心逻辑
tools/src/        MCP 安全工具适配器
tests/            单元与集成测试
preset/redteam/   DSH 红队模式配置
deploy/knowledge/ 可选知识图服务配置
scripts/          构建辅助脚本
```

内置工具按插件名称独立组织：

```text
tools/src/plugins/
├── burp/index.ts
├── metasploit/index.ts
├── nmap/index.ts
└── nuclei/index.ts
```

四个内置适配器会随 MCP 服务默认注册。看板会检测宿主机上的 Nmap、Burp Suite、
Metasploit 和 Nuclei；未检测到时，在对应工具下方以红字显示“工具未安装”。可用
`PRISM_NMAP_BIN`、`PRISM_BURP_BIN`、`PRISM_MSFCONSOLE_BIN`、`PRISM_NUCLEI_BIN`
指定不在 `PATH` 中的可执行文件或 Burp 应用路径。

## 自定义工具扩展

自定义插件目录名必须与插件的 `name` 一致，并提供编译后的 `index.js` 或 `index.mjs`：

```text
custom-tools/
└── example-tool/
    └── index.mjs
```

插件默认导出可使用公开辅助函数定义：

```ts
import { defineToolPlugin } from '@prism-ai/dsh-redteam/tools/plugin'

export default defineToolPlugin({
  name: 'example-tool',
  register(server) {
    server.registerTool(
      'example_status',
      {
        description: '检查自定义工具状态。',
        annotations: { openWorldHint: false, readOnlyHint: true },
      },
      async () => ({
        content: [{ type: 'text', text: '{"available":true}' }],
        structuredContent: { available: true },
      }),
    )
  },
})
```

启动 MCP 服务时通过环境变量加载一个或多个插件目录：

```bash
DSH_REDTEAM_TOOL_PLUGIN_PATHS=/absolute/path/custom-tools/example-tool dsh-redteam-mcp
```

多个路径使用操作系统的 PATH 分隔符：macOS/Linux 使用 `:`，Windows 使用 `;`。外部插件会在
MCP 服务进程中执行任意 JavaScript，仅应加载经过审查且来源可信的本地插件。

## 安全边界

本项目仅用于合法的安全研究、教学与具有明确书面授权的测试，严禁用于任何非法用途。使用者必须
遵守所在地法律法规，并自行确保已获得目标系统所有者的充分授权。执行权限不会扩大目标范围，
也不会绕过 DSH 的沙箱、审批和安全策略。请勿对未授权系统进行扫描、验证、利用或造成破坏。

## License

[MIT](LICENSE)
