# 服务指纹与漏洞

模块 ID：`service-vulnerabilities`

状态：`implemented`（开发快照，非发布状态）。

服务指纹、协议与配置风险检查。

当前实现入口：

- `src/lib/native-services.ts`

当前目录用于模块边界与迁移映射；运行时注册仍由 `src/server/app.ts` 显式提供。
