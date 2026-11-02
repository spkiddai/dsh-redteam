# 单插件架构

## 系统边界

DeepSeek Harness 是唯一 Agent 核心。`dsh-redteam` 使用最新版 DSH 的 Agent、Tool、System Prompt、
Sandbox Policy、Agent Preset、客户端 Slot 和 MCP 扩展点，不实现第二套模型客户端、Agent loop、会话
存储、审批系统或计划引擎。登录网关代理同一个 DSH Web 应用，专用 root Slot 呈现棱镜界面。

包只从 `src/index.ts` 导出一个 Cordis 插件入口。`preset/redteam/` 是 DSH 原生 Preset 组合，
`tools/` 是由该 Preset 通过 DSH MCP 客户端启动的 stdio 服务；两者都不是第二个 Cordis 插件入口。

```text
DeepSeek Harness 0.2.1-rc.2
├── 模型、会话、工作区、沙箱、审批、MCP 客户端
└── @prism-ai/dsh-redteam
    ├── LoginGateway         HTTP 与 WebSocket 登录保护
    ├── TeamStore            PostgreSQL 账号、角色、用户例外与审计
    ├── TeamBridge           用户身份映射、项目资源与原生访问策略
    ├── PrismShell           概览、项目、用户管理、权限管理、原生工作台
    ├── ClientDashboard      棱镜看板与当前会话投影
    ├── ExecutionPolicy      工具、范围、模式三层判定
    ├── ScopeGuard           工作区路径补充检查
    ├── AssetGraph           公开来源资产图与有界队列
    ├── PassiveScanner       本地确定性规则扫描
    ├── AssessmentStore      Finding 与评估持久化
    ├── ProjectMemory        项目领域事件
    ├── LongTermKnowledge    JSON 事实源与 FTS5 索引
    ├── Reporter             资产图和评估报告
    ├── KnowledgeClients     可选 Graphiti/RAGFlow
    └── tools/ MCP Server    本机安全工具协议适配
```

## 生命周期

插件在 Host 根作用域加载，以便客户端模块进入初始模块图。它监听 Agent 生命周期，只对选择了
`redteam` Preset 的 Agent scope 注册二十一个 `redteam_*` 工具、System Prompt 段和执行前策略。

卸载插件 fiber 时，工具、Prompt、策略监听器、登录网关和客户端贡献一起撤销。产品界面只创建和
选择 redteam 会话，其他 DSH 预设在 Web profile 中禁用。

## 主要数据流

### 资产测绘

1. `redteam_asset_map_start` 从组织、域名、IP、CIDR、URL、ASN 等种子创建资产图。
2. Agent 使用 DSH 的公开 Web 搜索查找来源。
3. `redteam_asset_map_observe` 校验并合并节点、关系、来源和已扩展节点。
4. `redteam_asset_map_frontier` 按深度返回下一批待扩展节点。
5. `redteam_asset_map_report` 输出 HTML、Mermaid Markdown、GraphML 或 JSON。

### 本地规则扫描

1. `redteam_scan` 解析授权工作区和扫描子路径。
2. ScopeGuard 拒绝越界和符号链接逃逸。
3. Scanner 只读取有界文本文件，不执行代码，也不发起网络请求。
4. 规则命中转换为稳定 ID 的 `candidate`，证据先脱敏、截断，再保存。
5. `redteam_findings` 读取结果，`redteam_update_finding` 记录状态变化。
6. `redteam_report` 从同一评估生成多格式报告。

### 本地 MCP 工具

1. 红队 Preset 让 DSH MCP 客户端启动 `tools/dist/server.js`。
2. MCP 服务发现本机 Nmap、Nuclei、Metasploit，或连接本机 Burp 代理。
3. 每次调用先经过棱镜 ExecutionPolicy。
4. 已确认工具、目标范围和模式通过后，再进入 DSH 原生策略。未评估、未确认或没有有效映射的 MCP 工具默认拒绝。
5. 子进程使用无 Shell 参数数组启动，并应用超时、输出上限和 ANSI 清理。

### AI 工具权限建议

1. 连接成功后客户端向当前 DSH 会话排队提交评估请求。
2. Agent 使用 `redteam_mcp_permissions inspect` 获取有界工具元数据和目录版本。
3. Agent 使用 `propose` 提交逐项建议；Host 校验工具名、目标参数类型和目录版本，只保存未确认建议。
4. 看板显示等级、理由和目标参数；用户确认建议版本，再勾选并确认启用。
5. 执行前校验当前工具元数据摘要、建议确认、工具启用、目标范围和操作等级，再调用 DSH 下游策略。
6. 重新评估撤销该连接的启用选择；工具定义变化使原建议失效。

### 项目记忆与知识

1. 项目工具把显式领域事件写入版本化 JSON。
2. 长期知识工具维护稳定 `redteam://` URI 和 L0/L1/L2 投影。
3. SQLite FTS5 只保存可重建的检索索引。
4. 只有逐条审核通过的事件可以晋升长期知识。
5. Graphiti/RAGFlow 只接收可选的有界投影，不能覆盖本地事实。

## 数据目录

默认根目录为 `<workspace>/.dsh-redteam/`：

```text
.dsh-redteam/
├── sessions/<session-id-sha256>.json  # 会话权限与无凭证 MCP 连接定义
├── assessments/<assessment-id>/
│   ├── assessment.json
│   └── reports/
├── asset-graphs/<graph-id>/
│   ├── graph.json
│   └── reports/
├── latest-asset-graph.json
└── knowledge/
    ├── current-project.json
    ├── projects/<project-id>/events/
    ├── library/<type>/<kb-id>/
    └── index/knowledge.sqlite3
```

写入采用私有权限和原子替换。`.dsh-redteam` 是用户数据，不进入发布包，也不由升级或卸载自动删除。

## 源码职责

```text
src/index.ts                    唯一发布入口
src/cli.ts                      Preset 与 profile 保护式安装器
src/client/                     看板、样式、Prompt 与最新版客户端契约
src/plugins/redteam.ts          Cordis/DSH 适配、RPC 与工具注册
src/lib/execution-policy.ts     模式、工具和目标范围判定
src/lib/session-settings.ts     会话权限和 MCP 连接定义持久化
src/lib/mcp-permissions.ts      AI 权限建议校验和工具元数据绑定
src/lib/asset-graph*.ts         资产图、存储和报告
src/lib/scanner.ts              有界扫描器
src/lib/rules.ts                内置规则
src/lib/scope.ts                路径范围
src/lib/redact.ts               脱敏
src/lib/store.ts                评估存储
src/lib/knowledge*.ts           项目记忆、长期知识和外部客户端
src/lib/report.ts               评估报告
tools/src/                      本机安全工具 MCP 适配器
preset/redteam/                 红队 Agent Preset
```

## 登录边界

DSH 原生 Web 监听本机随机端口，保留自身认证。棱镜网关通过当前 DSH 公共连接接口获取仅在内存中
使用的内核 Cookie；浏览器只持有棱镜 HttpOnly/SameSite Cookie。HTTP、静态资源、API 和 WebSocket
都经过登录检查，退出撤销会话并关闭该会话的实时连接。数据库保存账号、角色和用户例外，与 DSH 会话存储相互独立。

棱镜根界面替换原生 AppFrame，保留原生 PendingApproval/PendingQuestion 的审批和提问方法，不实现
第二套审批引擎。浏览器通过非主机所有者的原生连接调用 API，身份映射为数据库用户；策略 RPC 按项目资源权限检查读取、执行和管理。权限变更后撤销现有连接并重新计算授权。主机工具连接另检查 `tools.manage`，原生审批保持生效。
