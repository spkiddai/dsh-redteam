# 插件配置

## 默认行为

通常不需要手写配置。红队模式从当前 DSH 会话取得工作区，并把运行数据写入
`<workspace>/.dsh-redteam/`。安装器加入 Web profile 的插件行，只负责加载同一个插件与客户端看板。

需要固定工作区、调整资源预算、自定义规则或连接知识服务时，可以在插件项下增加 `config`。

## 基础配置

| 配置项                  | 默认值                     | 说明                                |
| ----------------------- | -------------------------- | ----------------------------------- |
| `workspaceRoot`         | 当前会话工作区             | 固定唯一授权工作区                  |
| `storageRoot`           | `<workspace>/.dsh-redteam` | 评估、资产图和项目指针目录          |
| `categories`            | 三类全部启用               | `secret`、`source`、`configuration` |
| `ignoreDirectories`     | `[]`                       | 额外忽略的简单目录名                |
| `maxFiles`              | `2000`                     | 单次扫描文件数，范围 1–100000       |
| `maxFileBytes`          | `1000000`                  | 单文件字节数，范围 1024–20000000    |
| `maxFindings`           | `500`                      | 单次 Finding 上限，范围 1–10000     |
| `enforceWorkspaceScope` | `true`                     | 启用路径范围补充守卫                |

未固定 `workspaceRoot` 时不能全局设置 `storageRoot`，避免多个会话把数据写入同一个错误目录。

插件始终忽略 `.git`、`.dsh-redteam`、`node_modules`、`dist`、`target`、`vendor` 等生成或依赖目录。
`ignoreDirectories` 只能包含不带 `/` 或 `\\` 的目录名。

## 资产图配置

| 配置项                 | 默认值 | 范围    |
| ---------------------- | ------ | ------- |
| `assetGraphMaxDepth`   | `3`    | 1–5     |
| `assetGraphMaxNodes`   | `2000` | 1–10000 |
| `assetGraphMaxEdges`   | `5000` | 1–30000 |
| `assetGraphMaxSources` | `5000` | 1–30000 |

单次观察最多合并 100 条观察和 100 个已扩展节点。来源必须是 HTTP(S) URL；带账号密码的 URL 被拒绝，
敏感查询参数在保存前脱敏。

## 知识库配置

| 配置项                      | 默认值                    | 说明                        |
| --------------------------- | ------------------------- | --------------------------- |
| `knowledgeRoot`             | `<storageRoot>/knowledge` | 本地知识根                  |
| `knowledgeMaxDocuments`     | `10000`                   | 长期条目上限，最大 100000   |
| `knowledgeMaxProjectEvents` | `5000`                    | 每项目事件上限，最大 100000 |
| `knowledgeTimeoutMs`        | `15000`                   | 外部服务超时，500–120000 ms |

跨工作区共享 `knowledgeRoot` 时，必须使用专用的私有目录。不要使用文件系统根、工作区根或混有其他文件的
通用目录。

## Graphiti 和 RAGFlow

外部知识服务全部可选：

| 配置项                          | 说明                                       |
| ------------------------------- | ------------------------------------------ |
| `graphitiUrl`                   | Graphiti REST 地址                         |
| `graphitiAuthTokenEnv`          | Graphiti Bearer Token 的环境变量名         |
| `ragflowUrl`                    | RAGFlow 地址                               |
| `ragflowApiKeyEnv`              | API Key 环境变量名，默认 `RAGFLOW_API_KEY` |
| `ragflowAssetDatasetId`         | 资产数据集                                 |
| `ragflowVulnerabilityDatasetId` | 漏洞数据集                                 |
| `ragflowTechniqueDatasetId`     | 技术数据集                                 |
| `ragflowSrcCaseDatasetId`       | SRC 案例数据集                             |
| `ragflowSourceDatasetId`        | 来源数据集                                 |
| `allowRemoteKnowledgeServices`  | 允许远程 HTTPS 服务，默认 `false`          |

默认只接受回环地址上的 HTTP 服务。远程服务必须使用 HTTPS，并显式设置
`allowRemoteKnowledgeServices: true`。Token 只通过大写环境变量名读取，不应写入 Cordis 配置。

## 自定义规则

自定义规则 ID 必须以 `RT-CUSTOM-` 开头，并声明类别、标题、严重度、可信度、CWE、正则和修复建议。
正则必须可编译、不能匹配空字符串，内容和路径规则都会受到长度限制。

```yaml
- id: dsh-redteam
  name: '@prism-ai/dsh-redteam'
  config:
    maxFiles: 5000
    maxFindings: 1000
    assetGraphMaxDepth: 3
    knowledgeMaxDocuments: 10000
    customRules:
      - id: RT-CUSTOM-DEBUG
        version: '1'
        category: configuration
        title: Production debug mode enabled
        severity: medium
        confidence: medium
        cwe: CWE-489
        pattern: '\\bdebug\\s*[:=]\\s*true\\b'
        ignoreCase: true
        pathPattern: '\\.(json|ya?ml|toml)$'
        pathIgnoreCase: true
        remediation: Disable debug mode in production configuration.
```

自定义规则与内置规则使用同一扫描、脱敏、存储和报告路径，不会创建新的插件入口。

## 登录入口

`loginPort` 默认为 `3080`（本地启动时 `--port` 优先），`loginHost` 默认为 `127.0.0.1`，
`loginOrigin` 可指定完整 HTTP(S) 访问源，`accountRoot` 默认为 `$DSH_HOME/prism-auth`。
容器仅将登录网关绑定 `0.0.0.0`，宿主机端口仍默认只映射 `127.0.0.1`。详见 [容器部署](container.md)。
