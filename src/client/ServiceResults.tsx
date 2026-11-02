import { useState } from 'react'
import { SERVICE_STATE_LABEL, type ScanJob } from '../lib/native-scan-types.js'

export function ServiceResults({ job }: { job: ScanJob }) {
  const [query, setQuery] = useState('')
  const rows = (job.serviceResults ?? []).filter((row) =>
    `${row.target} ${row.port} ${row.protocol} ${row.product} ${row.version}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  return (
    <section className="prism-service-results">
      <div className="prism-surface-heading">
        <h3>端口服务指纹</h3>
        <span className="prism-muted">
          {job.serviceResults?.filter((r) => r.state === 'identified').length ?? 0} 项已识别
        </span>
      </div>
      <p className="prism-scan-message">
        协议依据实际响应识别；产品与版本为对端声明。未知服务和检测失败不表示安全，未按版本猜测 CVE。
      </p>
      <div className="prism-scan-filters">
        <input
          aria-label="搜索服务指纹"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索主机、端口、服务或版本…"
        />
      </div>
      <div className="prism-scan-table-wrap">
        <table className="prism-scan-table">
          <thead>
            <tr>
              <th>目标 / 端口</th>
              <th>协议 / 产品</th>
              <th>声明版本</th>
              <th>识别状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.target}:${row.port}`}>
                <td>
                  {row.target}:{row.port}
                  <small>{row.address || '未解析'}</small>
                </td>
                <td>
                  {row.protocol || '未知'}
                  <small>{row.product || '未确认产品'}</small>
                </td>
                <td>{row.version || '未提供'}</td>
                <td>
                  {SERVICE_STATE_LABEL[row.state]}
                  <small>{row.detail}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="prism-scan-empty">暂无符合条件的服务指纹。</p>}
      <div className="prism-surface-heading">
        <h3>协议漏洞与配置风险</h3>
        <span className="prism-muted">仅列出实际命中的规则</span>
      </div>
    </section>
  )
}
