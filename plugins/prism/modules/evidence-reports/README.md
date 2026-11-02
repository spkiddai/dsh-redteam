# 证据与报告

模块 ID：`evidence-reports`

状态：`implemented`（开发快照，非发布状态）。

结构化发现、处置记录与有界脱敏报告。

当前实现入口：

- `src/lib/native-report.ts`
- `src/lib/report.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
