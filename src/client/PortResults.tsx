import { useState } from 'react'
import { portResultKey, type PortResult, type ScanJob } from '../lib/native-scan-types.js'
import { PORT_STATE_LABEL } from '../lib/native-report.js'

function webTarget(row: PortResult, scheme: string) {
  return `${scheme}://${row.target.includes(':') ? '[' + row.target + ']' : row.target}:${row.port}/`
}

export function PortResults({
  job,
  canRun,
  onWeb,
  onServices,
}: {
  job: ScanJob
  canRun: boolean
  onWeb(urls: string[]): void
  onServices?(target: string, port: number): void
}) {
  const [status, setStatus] = useState('open')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [scheme, setScheme] = useState('https')
  const results = job.portResults ?? []
  const matches = results.filter(
    (r) =>
      (status === 'all' || r.state === status) &&
      `${r.target} ${r.address} ${r.port} ${r.serviceHint}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(matches.length / 50)),
    current = Math.min(page, pages)
  const chosen = results.filter((r) => r.state === 'open' && selected.includes(portResultKey(r)))
  const visible = matches.slice((current - 1) * 50, current * 50)
  const selectable = visible.filter((r) => r.state === 'open')
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.includes(portResultKey(r)))
  return (
    <>
      <div className="prism-port-counts">
        {Object.entries(PORT_STATE_LABEL).map(([key, label]) => (
          <div key={key}>
            <small>{label}</small>
            <strong>{results.filter((r) => r.state === key).length}</strong>
          </div>
        ))}
      </div>
      <div className="prism-scan-filters">
        <input
          aria-label="搜索端口结果"
          placeholder="搜索主机、端口或用途…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="端口状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部状态</option>
          {Object.entries(PORT_STATE_LABEL).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="prism-scan-message">
        用途仅按端口号推测，尚未验证实际服务或版本。TCP 连接成功不代表存在漏洞。
      </p>
      <div className="prism-port-batch">
        <span aria-live="polite">已选 {chosen.length} / 20 个开放端口</span>
        <button disabled={!chosen.length} onClick={() => setSelected([])}>
          清空选择
        </button>
        <label>
          后续协议
          <select
            aria-label="批量 Web 检查协议"
            value={scheme}
            onChange={(e) => setScheme(e.target.value)}
          >
            <option value="https">HTTPS</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <button
          disabled={!canRun || !chosen.length}
          onClick={() => onWeb(chosen.map((r) => webTarget(r, scheme)))}
        >
          批量 Web 检查
        </button>
        <small>仅填写新扫描表单；确认后再开始。筛选和翻页保留选择。</small>
      </div>
      <div className="prism-scan-table-wrap">
        <table className="prism-scan-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="选择本页开放端口（最多 20 个）"
                  disabled={!canRun || !selectable.length || (!allSelected && chosen.length >= 20)}
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected
                        ? selected.filter(
                            (key) => !selectable.some((r) => portResultKey(r) === key),
                          )
                        : [
                            ...new Set([
                              ...chosen.map(portResultKey),
                              ...selectable.map(portResultKey),
                            ]),
                          ].slice(0, 20),
                    )
                  }
                />
              </th>
              <th>主机 / 解析地址</th>
              <th>TCP 端口</th>
              <th>状态</th>
              <th>常见用途</th>
              <th>后续检查</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.target}:${row.port}`}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${row.target}:${row.port}`}
                    checked={row.state === 'open' && selected.includes(portResultKey(row))}
                    disabled={
                      !canRun ||
                      row.state !== 'open' ||
                      (chosen.length >= 20 && !selected.includes(portResultKey(row)))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...chosen.map(portResultKey), portResultKey(row)]
                          : selected.filter((key) => key !== portResultKey(row)),
                      )
                    }
                  />
                </td>
                <td>
                  {row.target}
                  <small>{row.address || '未解析或被阻止'}</small>
                </td>
                <td>{row.port}</td>
                <td>
                  <span className={'prism-port-state ' + row.state}>
                    {PORT_STATE_LABEL[row.state]}
                  </span>
                  <small>{row.detail}</small>
                </td>
                <td>{row.serviceHint}</td>
                <td>
                  {row.state === 'open' && (
                    <div className="prism-scan-actions">
                      {onServices && (
                        <button disabled={!canRun} onClick={() => onServices(row.target, row.port)}>
                          指纹漏洞检查
                        </button>
                      )}
                      {['http', 'https'].map((scheme) => (
                        <button
                          key={scheme}
                          disabled={!canRun}
                          onClick={() => onWeb([webTarget(row, scheme)])}
                        >
                          {scheme.toUpperCase()} 检查
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && (
          <p className="prism-scan-empty">
            {results.length
              ? '没有符合筛选条件的端口。超时或连接错误不表示端口已关闭。'
              : '正在等待端口探测结果。'}
          </p>
        )}
      </div>
      <div className="prism-port-pagination">
        <span>
          {matches.length} 条结果 · 第 {current} / {pages} 页
        </span>
        <button disabled={current === 1} onClick={() => setPage(current - 1)}>
          上一页
        </button>
        <button disabled={current === pages} onClick={() => setPage(current + 1)}>
          下一页
        </button>
      </div>
    </>
  )
}
