# dsh-redteam 文档

本目录是 `dsh-redteam 1.4.0` 的完整文档，内容以 DeepSeek Harness `0.2.1-rc.2` 为唯一兼容目标。

## 开始使用

- [Docker Compose 部署](container.md)：一键启动、账号存储、持久化、模型凭据与运维。

- [安装与启动](installation.md)：环境要求、安装、认证、更新、卸载和常见问题。
- [使用指南](user-guide.md)：从创建会话到信息收集、确认范围、扫描、验证和导出结果。
- [红队模式](redteam-mode.md)：看板组成、模型情况、四档模式和会话行为。

## 工具与配置

- [MCP 安全工具](mcp-tools.md)：Nmap、Burp Suite、Metasploit、Nuclei 的安装要求、能力和限制。
- [插件配置](configuration.md)：工作区、扫描、资产图、知识库和外部服务配置。
- [检测规则](rules.md)：内置规则、自定义规则和 Finding 状态。

## 设计与维护

- [安全模型](security-model.md)：目标范围、执行权限、工具确认、审批和数据保护。
- [单插件架构](architecture.md)：组件边界、运行流程、数据目录和源码职责。
- [项目记忆与长期知识](knowledge.md)：本地事实源、分层读取、晋升流程及可选扩展。
- [测试与发布](testing.md)：质量门禁、兼容性验证和发布检查。
- [版本状态与计划](development-plan.md)：当前交付范围和后续迭代原则。

## 阅读建议

首次部署按“安装与启动 → 使用指南 → MCP 安全工具”的顺序阅读；准备生产或团队环境时，再阅读
“安全模型”和“插件配置”。
