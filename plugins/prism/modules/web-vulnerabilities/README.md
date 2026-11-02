# Web 漏洞扫描

模块 ID：`web-vulnerabilities`

状态：`implemented`（开发快照，非发布状态）。

原生 HTTP/TLS 规则执行与规则管理。

当前实现入口：

- `src/lib/native-engine.ts`
- `src/lib/native-rules.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
