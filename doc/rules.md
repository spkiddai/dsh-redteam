# 检测规则

## 内置规则

当前规则集版本为 `2026.08.1`，每条内置规则版本为 `1`。

| Rule ID       | 类别          | 检测内容              | 默认严重度 |
| ------------- | ------------- | --------------------- | ---------- |
| RT-SECRET-001 | secret        | 私钥材料              | critical   |
| RT-SECRET-002 | secret        | AWS Access Key ID     | high       |
| RT-SECRET-003 | secret        | 可能的硬编码凭证      | high       |
| RT-SOURCE-001 | source        | 动态代码执行          | high       |
| RT-SOURCE-002 | source        | Shell 命令执行点      | high       |
| RT-SOURCE-003 | source        | TLS 证书校验关闭      | high       |
| RT-SOURCE-004 | source        | 可能的 SQL 字符串插值 | high       |
| RT-CONFIG-001 | configuration | 特权容器              | high       |
| RT-CONFIG-002 | configuration | 宽松 CORS Origin      | medium     |

这些规则是快速、确定性的候选发现器，不进行完整数据流、可达性或可利用性证明。扫描器不执行项目代码，
也不发起网络请求。

## Finding 内容

每条 Finding 包含规则与版本、CWE、严重度、可信度、文件位置、脱敏证据和修复建议。相同文件中重复的
命中保持独立，Finding ID 在相同内容的重复扫描之间保持稳定。

所有新结果初始状态都是 `candidate`，不能直接描述成已确认漏洞。

## 状态工作流

| 状态        | 含义                 |
| ----------- | -------------------- |
| `candidate` | 待人工或授权流程复核 |
| `confirmed` | 证据已确认           |
| `accepted`  | 已接受风险           |
| `fixed`     | 已修复或复测通过     |

状态变更必须填写非空理由。理由保存前脱敏并截断，每条 Finding 最多保留 100 条历史。状态迁移受规则约束，
不能从 `candidate` 直接标记为 `fixed`。

## 自定义规则

插件配置可以加入 `RT-CUSTOM-*` 规则。每条规则包括：

- 唯一 ID 和版本。
- `secret`、`source` 或 `configuration` 类别。
- 标题、严重度、可信度和 CWE。
- 内容正则与可选路径正则。
- 修复建议。

正则表达式必须可编译、不能匹配空字符串，且受到长度限制。自定义规则与内置规则共享扫描预算、路径
范围、脱敏、持久化、Finding 工作流和报告格式。

配置示例见 [插件配置](configuration.md)。
