import type { ScanJob } from './native-scan-types.js'
import { completedScanChecks, totalScanChecks, SERVICE_STATE_LABEL } from './native-scan-types.js'
export const PORT_STATE_LABEL = {
  open: '开放',
  closed: '关闭',
  filtered: '超时 / 未确定',
  error: '连接错误',
}

export const SCAN_STATE_LABEL = {
  queued: '等待中',
  running: '扫描中',
  paused: '已暂停',
  completed: '已完成',
  partial: '部分完成',
  cancelled: '已取消',
  failed: '执行失败',
  interrupted: '已中断',
}
export const SCAN_SEVERITY_LABEL = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '信息',
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function scanReport(job: ScanJob): string {
  const e = escapeHtml
  const fingerprints =
    job.kind === 'services'
      ? `<section><h2>端口服务指纹</h2><p>依据实际协议响应识别；产品和版本为对端声明，未按版本推定 CVE。</p><table><tr><th>目标 / 端口</th><th>协议 / 产品 / 版本</th><th>状态 / 依据</th></tr>${(job.serviceResults ?? []).map((r) => `<tr><td>${e(r.target)}:${r.port}<br>${e(r.address)}</td><td>${e(r.protocol || '未知')} / ${e(r.product || '未确认')} / ${e(r.version || '未提供')}</td><td>${e(SERVICE_STATE_LABEL[r.state])}<br>${e(r.detail)}</td></tr>`).join('')}</table></section>`
      : ''
  if (job.kind === 'ports')
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${e(job.name)} · 棱镜端口扫描</title><style>body{max-width:1100px;margin:40px auto;padding:24px;font:14px/1.7 system-ui;color:#263047}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left;overflow-wrap:anywhere}th{background:#f5f3ff}</style><h1>${e(job.name)}</h1><p>${e(SCAN_STATE_LABEL[job.state])} · ${e(job.createdAt)} · ${completedScanChecks(job)}/${totalScanChecks(job)} 项端口探测</p><p>TCP Connect 扫描。用途仅按端口号推测；开放端口不代表存在漏洞。未响应、超时和错误不表示关闭。</p><p>目标：${job.targets.map(e).join('、')}<br>并发：${job.portScan!.concurrency}；连接超时：${job.policy.timeoutMs} ms；批次间隔：${job.policy.delayMs} ms</p><table><tr><th>主机 / 地址</th><th>端口</th><th>状态</th><th>常见用途</th><th>检测依据</th></tr>${(job.portResults ?? []).map((r) => `<tr><td>${e(r.target)}<br>${e(r.address)}</td><td>${r.port}/tcp</td><td>${e(PORT_STATE_LABEL[r.state])}</td><td>${e(r.serviceHint)}</td><td>${e(r.detail)}</td></tr>`).join('')}</table><p>${e(job.message)}</p></html>`
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${e(job.name)} · 棱镜扫描报告</title><style>body{max-width:1100px;margin:40px auto;padding:24px;font:15px/1.7 system-ui;color:#263047}h1{color:#5046b5}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:12px;text-align:left;overflow-wrap:anywhere}th{background:#f5f3ff}.note{color:#687385}section{margin:32px 0}</style><h1>${e(job.name)}</h1><p>${e(SCAN_STATE_LABEL[job.state])} · ${e(job.createdAt)} · ${completedScanChecks(job)}/${totalScanChecks(job)} 项检查</p><p class="note">${job.kind === 'services' ? '棱镜原生端口指纹漏洞扫描' : '棱镜原生 HTTP/TLS 扫描'}。规则快照：${e(job.ruleHash)}。未命中不等于不存在漏洞；信息项属于加固建议。此报告不包含原始响应或 Cookie 值。</p><section><h2>目标与策略</h2><p>${job.targets.map(e).join('<br>')}</p><p>策略：${e(job.policy.id)}；每次请求超时 ${job.policy.timeoutMs} ms；间隔 ${job.policy.delayMs} ms。</p></section>${fingerprints}<section><h2>发现 (${job.findings.length})</h2><table><tr><th>等级 / 规则</th><th>目标 / 证据</th><th>修复建议</th><th>处置</th></tr>${job.findings.map((f) => `<tr><td>${e(SCAN_SEVERITY_LABEL[f.severity])}<br>${e(f.title)}<br>${e(f.ruleId)}</td><td>${e(f.target)}<br>${e(f.evidence)}</td><td>${e(f.remediation)}</td><td>${e(f.state)}<br>${e(f.note)}</td></tr>`).join('')}</table></section><section><h2>检查覆盖与未完成项</h2><table><tr><th>目标</th><th>规则 / 状态</th><th>说明</th></tr>${job.checks.map((c) => `<tr><td>${e(c.target)}</td><td>${e(c.ruleId)} / ${e(c.state)}</td><td>${e(c.detail)}</td></tr>`).join('')}</table><p>${e(job.message)}</p></section></html>`
}
