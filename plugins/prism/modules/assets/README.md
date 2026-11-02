# 资产发现与台账

模块 ID：`assets`

状态：`partial`（开发快照，非发布状态）。

独立资产台账已实现；AI 自动发现与旧资产图导入待迁移。

当前实现入口：

- `src/server/assets.ts`
- `src/lib/asset-graph.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
