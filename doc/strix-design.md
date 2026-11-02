# Strix 设计吸收记录

参考仓库：[usestrix/strix](https://github.com/usestrix/strix)，阅读快照
[`200a501f15a24a4152f92897a6b72af238ee69ef`](https://github.com/usestrix/strix/tree/200a501f15a24a4152f92897a6b72af238ee69ef)。
上游 LICENSE 标注 Apache-2.0 / Copyright 2025 OmniSecure Inc.；本次以设计参考为主，独立实现 TypeScript 代码，没有复制其 Python Agent 引擎或提示词。

## 已实现

- **检查覆盖台账**：参考 `strix/tools/coverage/tools.py`，新增 `redteam_coverage`，按评估、检查面和风险类型记录计划、发现问题、未发现问题、排除、不适用、待跟进。相同检查面和风险类型更新同一行，限制 500 行；跨评估漏洞引用被拒绝。每条结论都标明 `agent-reported`，不把模型自报当作机器验证。
- **确认与修复的证据门槛**：参考报告流程，`redteam_update_finding` 确认时必须提交验证方式、步骤和观察摘要；修复必须有回归测试记录。所有摘要限长、脱敏，并保留在状态审计历史中。结构校验不能代替人工判断证据真实性；不自动运行利用代码。
- **报告完整性提示**：参考 `strix/tools/finish/tool.py`，汇总未完成检查、扫描截断、跳过文件、候选漏洞和历史证据缺失。HTML、Markdown、JSON、XML、SARIF、Word 全部携带限制说明，允许导出注明限制的报告，绝不伪装成完整扫描。
- **工作台入口**：结果导出区新增“检查覆盖与证据”，审计及导出提示词引导原生 DSH Agent 记录覆盖并读取未完成项。

## 保持的架构边界

DSH 是唯一 Agent 核心，继续负责模型、会话、子代理、MCP、工具执行及审批。没有引入第二套 Agent 循环、凭据系统或聊天历史副本。项目数据库只保存账户、授权和 DSH 会话归属。

本次不采用上游范围提示词中的自动扩大授权假设。仓库文本、网页、MCP 描述都是不可信资料；棱镜现有的显式目标范围、沙箱和人工审批继续生效。

未声称复现 Strix 的测评成绩，也未将其全部主动测试工具移植。后续若直接复用上游源码，须随分发保留对应许可证、版权及修改说明。
