# 网络端口扫描

模块 ID：`network-ports`

状态：`implemented`（开发快照，非发布状态）。

原生 TCP 端口扫描与结果对比。

当前实现入口：

- `src/lib/native-ports.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
