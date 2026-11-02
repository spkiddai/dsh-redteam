# 工具集成

模块 ID：`tool-integrations`

状态：`partial`（开发快照，非发布状态）。

旧工具适配器保留；独立版外部 MCP 执行尚未迁移。

当前实现入口：

- `tools/src/server.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
