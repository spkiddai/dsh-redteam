# 项目记忆与长期知识

## 定位

插件默认提供本地 Red Team 项目记忆和长期知识库，不要求 Graphiti、RAGFlow、Neo4j、向量数据库或
额外模型。它是领域事实存储，不是第二套 DSH session store。

项目记忆只保存用户或工具明确写入的范围、资产观察、Finding、决定、任务和状态变化；不保存聊天、
Prompt、模型上下文、完整工具轨迹或成功利用响应正文。长期知识保存经过审核、可跨项目复用的资产、
漏洞、技术、SRC 案例和公开来源。

## 权威事实与索引

版本化 JSON 是唯一权威事实源。所有内容在写入前完成结构校验、长度限制和脱敏，并通过原子替换保存。

SQLite FTS5 只保存可重建的全文检索投影。索引缺失、版本落后或损坏时，从 JSON 重建；索引内容不能
覆盖 JSON 事实。内置检索适合 CVE/CWE、厂商、产品、版本、路径、命令和中英文正文，但不是向量语义
检索。

默认目录：

```text
<knowledgeRoot>/
├── .dsh-redteam-knowledge
├── projects/<project-id>/events/<event-id>.json
├── library/<knowledge-type>/<kb-id>/
│   ├── entry.json
│   └── revisions/<revision>.json
└── index/
    ├── knowledge.sqlite3
    └── dirty
```

当前项目指针位于 `<storageRoot>/knowledge/current-project.json`。即使多个工作区显式共享
`knowledgeRoot`，项目指针仍按工作区隔离。

## `redteam://` 命名空间

长期知识对象使用稳定 URI：

```text
redteam://knowledge
├── asset/<kb-id>
├── vulnerability/<kb-id>
├── technique/<kb-id>
├── src_case/<kb-id>
└── source/<kb-id>
```

URI 只用于知识对象引用，不映射成可任意读取的文件路径。

## L0、L1、L2

| 层级 | 用途                     | 内容                   |
| ---- | ------------------------ | ---------------------- |
| L0   | 快速筛选和上下文预算控制 | 极短摘要               |
| L1   | 检索结果判断和条目比较   | 有界概览               |
| L2   | 复核细节和生成报告       | 完整但有长度上限的正文 |

`redteam_knowledge_tree` 只返回目录指针；`search` 返回有界 L1 预览；`grep` 返回精确片段；只有
`redteam_knowledge_read` 会按指定对象读取 L0、L1 或 L2。插件不会为了生成摘要再启动一个模型客户端。

## 十个知识工具

- `redteam_knowledge_status`：检查本地事实源、FTS5、当前项目和可选扩展状态。
- `redteam_project_start`：创建项目并写入第一条事件。
- `redteam_project_remember`：显式追加一条结构化、已脱敏事件。
- `redteam_project_recall`：按项目读取或检索事件。
- `redteam_project_promote`：审核并晋升一条项目事件。
- `redteam_knowledge_upsert`：新增或修订长期知识。
- `redteam_knowledge_search`：执行有界全文检索。
- `redteam_knowledge_tree`：浏览轻量 URI 目录。
- `redteam_knowledge_grep`：精确查找标识符、版本、路径、命令或正文。
- `redteam_knowledge_read`：读取一个对象的指定层级。

加上状态、资产测绘、扫描、Finding、报告、覆盖台账和 MCP 权限建议工具，红队模式共注册二十一个领域工具。外部知识服务
不可用时，这二十一个工具仍然存在。

## 项目事件权威性

事件的 `authority` 用于区分：

- `authoritative`：用户或规则明确确认的状态。
- `observed`：有来源支持的观察。
- `inferred`：仍需验证的假设。

召回结果发生冲突时，应优先采用最新的明确状态变化；检索命中和推断不能自动改写成已确认事实。

## 晋升长期知识

项目内容不会整库自动晋升。单条事件必须同时满足：

- `sensitivity` 为 `reusable`；
- `promotable` 为 `true`；
- `authority` 不是 `inferred`；
- `status` 为 `confirmed`、`resolved` 或 `archived`；
- 事件类型与长期知识类型兼容。

凭证、客户机密和成功利用结果正文禁止进入长期知识库。

## 容量与共享

默认最多保存 10,000 条长期知识和每项目 5,000 条事件，二者部署上限均为 100,000。达到上限时新增
写入明确失败，不会自动删除旧内容。

默认每个工作区独立存储。跨工作区共享时必须显式配置同一个专用私有 `knowledgeRoot`。目录 marker、
逐级符号链接检查和根级短时写锁保护共享写入。只有确认没有 DSH 进程使用该目录时，才可人工处理异常
遗留的 `.write.lock`。

## 可选 Graphiti 与 RAGFlow

- Graphiti：保存有界项目事件投影，辅助时间关系和派生事实检索。
- RAGFlow：保存审核后的长期知识投影，辅助大规模分片和向量检索。

两者都不是权威事实源。外部调用失败时，本地成功结果仍保留，并通过 `extensionWarnings` 表示未同步；
当前版本不承诺后台自动重试。

默认只允许回环 HTTP 地址。远程连接必须是 HTTPS，并显式启用远程知识服务。凭证只从配置指定的环境
变量读取。
