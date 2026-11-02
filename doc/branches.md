# 公开快照的目录与分支

本仓库为 `spkiddai/dsh-redteam`，默认分支为 `main`，保留最后以 DSH 为默认运行方式的 `1.4.0` 源码快照。
原先的核心、红队、蓝队分支规划不属于这个独立公开仓库，也不作为启动依赖。

- `src/index.ts`、`src/plugins/`：DSH / Cordis 插件入口与集成。
- `src/client/`：DSH 页面与红队功能界面。
- `src/lib/`：范围约束、规则、原生扫描、资产、证据与报告等逻辑。
- `tools/`：MCP 工具服务及外部工具适配。
- `preset/redteam/`、`deploy/container/`：DSH 预设与容器启动配置。
- `plugins/prism/modules/`：当时的模块边界说明，不表示已实现独立动态加载。
- `src/server/`、`src/client/standalone/`、`standalone/`：当时保留的实验性独立版代码。

版本来源与公开整理范围见 [快照说明](snapshot.md)。
