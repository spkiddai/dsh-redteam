// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PortResults } from '../../src/client/PortResults.js'
import type { ScanJob } from '../../src/lib/native-scan-types.js'
afterEach(cleanup)
it('paginates many results and explicitly constructs IPv6 Web targets', () => {
  const portResults = Array.from({ length: 51 }, (_, i) => ({
    target: '2001:4860:4860::8888',
    address: '2001:4860:4860::8888',
    port: i + 1,
    state: 'open',
    serviceHint: '未知',
    detail: '连接成功',
    at: '',
  }))
  const job = { portResults } as unknown as ScanJob,
    onWeb = vi.fn()
  const view = render(<PortResults job={job} canRun onWeb={onWeb} />)
  expect(screen.getByText('51 条结果 · 第 1 / 2 页')).toBeTruthy()
  fireEvent.click(screen.getByText('下一页'))
  expect(screen.getByText('51 条结果 · 第 2 / 2 页')).toBeTruthy()
  fireEvent.click(screen.getByText('HTTPS 检查'))
  expect(onWeb).toHaveBeenCalledWith(['https://[2001:4860:4860::8888]:51/'])
  fireEvent.click(screen.getByText('上一页'))
  fireEvent.change(screen.getByLabelText('端口状态'), { target: { value: 'error' } })
  expect(screen.getByText(/没有符合筛选条件/)).toBeTruthy()
  view.rerender(
    <PortResults job={{ portResults: [] } as unknown as ScanJob} canRun={false} onWeb={onWeb} />,
  )
  expect(screen.getByText('正在等待端口探测结果。')).toBeTruthy()
})

it('keeps a bounded selection across pages and filters, and only hands off open ports', () => {
  const portResults = Array.from({ length: 52 }, (_, i) => ({
    target: 'example.test',
    address: '192.168.1.2',
    port: i + 1,
    state: i === 51 ? 'closed' : 'open',
    serviceHint: '未知',
    detail: '',
    at: '',
  }))
  const onWeb = vi.fn()
  const job = { portResults } as unknown as ScanJob
  const view = render(<PortResults job={job} canRun onWeb={onWeb} />)
  fireEvent.click(screen.getByLabelText('选择本页开放端口（最多 20 个）'))
  expect(screen.getByText('已选 20 / 20 个开放端口')).toBeTruthy()
  expect((screen.getByLabelText('选择 example.test:21') as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('选择 example.test:1'))
  fireEvent.click(screen.getByText('下一页'))
  fireEvent.click(screen.getByLabelText('选择 example.test:51'))
  fireEvent.change(screen.getByLabelText('搜索端口结果'), { target: { value: 'not-found' } })
  fireEvent.change(screen.getByLabelText('批量 Web 检查协议'), { target: { value: 'http' } })
  fireEvent.click(screen.getByText('批量 Web 检查'))
  expect(onWeb).toHaveBeenCalledWith([
    ...Array.from({ length: 19 }, (_, i) => `http://example.test:${i + 2}/`),
    'http://example.test:51/',
  ])
  fireEvent.click(screen.getByText('清空选择'))
  expect((screen.getByText('批量 Web 检查') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('搜索端口结果'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('端口状态'), { target: { value: 'closed' } })
  expect((screen.getByLabelText('选择 example.test:52') as HTMLInputElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('端口状态'), { target: { value: 'open' } })
  fireEvent.click(screen.getByLabelText('选择 example.test:2'))
  view.rerender(<PortResults job={job} canRun={false} onWeb={onWeb} />)
  expect((screen.getByLabelText('选择 example.test:2') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByText('批量 Web 检查') as HTMLButtonElement).disabled).toBe(true)
})
