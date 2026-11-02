# Prism 本地安全工具 MCP

这个目录把本机已经安装的 Nmap、Burp Suite、Metasploit 和 Nuclei 暴露为一个 stdio MCP 服务。它只提供协议适配器，不下载、复制或内嵌第三方安全工具。

## 工作方式

- Nmap：从 `PATH` 查找 `nmap`，提供状态检查和受限 TCP 连接扫描。
- Nuclei：从 `PATH` 查找 `nuclei`，提供低并发、禁用 Interactsh/unsigned/DoS/fuzz 模板的扫描。
- Metasploit：从 `PATH` 查找 `msfconsole`，提供模块搜索、模块说明和 `check`；适配器不会调用 `run` 或 `exploit`。
- Burp Suite：连接本机回环地址上的 Burp 代理监听器，通过本机 `curl` 发送 GET、HEAD 或 OPTIONS 请求。默认地址为 `127.0.0.1:8080`。

所有网络调用都要求参数 `authorizationConfirmed: true`，并且只应针对当前项目中得到明确授权的目标。

## 本机配置

正常情况下，只要工具命令已经加入 `PATH` 就不需要额外配置。自定义安装位置和 Burp 监听端口可通过以下环境变量指定：

| 环境变量                | 默认值       | 用途                              |
| ----------------------- | ------------ | --------------------------------- |
| `PRISM_NMAP_BIN`        | `nmap`       | Nmap 可执行文件                   |
| `PRISM_NUCLEI_BIN`      | `nuclei`     | Nuclei 可执行文件                 |
| `PRISM_MSFCONSOLE_BIN`  | `msfconsole` | Metasploit 控制台                 |
| `PRISM_CURL_BIN`        | `curl`       | Burp 代理请求使用的 curl          |
| `PRISM_BURP_PROXY_HOST` | `127.0.0.1`  | Burp 本机代理地址，仅允许回环地址 |
| `PRISM_BURP_PROXY_PORT` | `8080`       | Burp 本机代理端口                 |

## 启动与检查

构建项目后启动 MCP 服务：

```bash
pnpm build
node tools/dist/server.js
```

也可以在安装这个包后使用：

```bash
dsh-redteam-mcp
```

Harness 通过 `@deepseek-ai/dsh-mcp-client` 连接这个 stdio 服务后，会发现以下工具：

- `nmap_status`、`nmap_scan`
- `burp_status`、`burp_proxy_request`
- `metasploit_status`、`metasploit_search`、`metasploit_module_info`、`metasploit_check`
- `nuclei_status`、`nuclei_scan`

服务本身可以在没有安装上述工具时启动。状态工具会报告可用性，执行工具则返回明确的安装或连接错误。
