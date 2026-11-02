import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { once } from 'node:events'
import { connectTeamStream } from '../src/plugins/team-stream.js'
import type { TeamPeer } from '../src/plugins/team-bridge.js'
const closes: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close()
})
async function pair() {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(wss, 'listening')
  const address = wss.address() as { port: number }
  const accepted = once(wss, 'connection'),
    client = new WebSocket(`ws://127.0.0.1:${address.port}`)
  await once(client, 'open')
  const [server] = await accepted
  closes.push(async () => {
    client.terminate()
    for (const ws of wss.clients) ws.terminate()
    await new Promise<void>((r) => wss.close(() => r()))
  })
  let cancelled = false
  connectTeamStream(server, {
    async *stream(
      endpoint: string,
      _payload: unknown,
      uplink: AsyncIterable<unknown>,
      signal: AbortSignal,
    ) {
      if (endpoint === 'fail') throw new Error('failure must be redacted')
      signal.addEventListener(
        'abort',
        () => {
          cancelled = true
        },
        { once: true },
      )
      for await (const value of uplink) yield value
    },
  } as unknown as TeamPeer)
  return { client, cancelled: () => cancelled }
}
const send = (client: WebSocket, frame: unknown) => client.send(JSON.stringify(frame))
describe('bounded native WebSocket carrier', () => {
  it('carries items, half-close, and cancellation without a second execution engine', async () => {
    const { client, cancelled } = await pair()
    send(client, {
      type: 'open',
      streamId: 's1',
      endpoint: 'session/follow',
      payload: { args: {} },
    })
    const item = once(client, 'message')
    send(client, { type: 'item', streamId: 's1', value: { value: 42 } })
    expect(JSON.parse(String((await item)[0]))).toEqual({
      type: 'item',
      streamId: 's1',
      value: { value: 42 },
    })
    const end = once(client, 'message')
    send(client, { type: 'end', streamId: 's1' })
    expect(JSON.parse(String((await end)[0])).type).toBe('end')
    expect(cancelled()).toBe(true)
    send(client, { type: 'cancel', streamId: 'missing' })
    send(client, {
      type: 'open',
      streamId: 's2',
      endpoint: 'session/follow',
      payload: { args: {} },
    })
    send(client, { type: 'cancel', streamId: 's2' })
  })
  it('does not disclose internal error text and rejects duplicate streams', async () => {
    const { client } = await pair()
    const failed = once(client, 'message')
    send(client, { type: 'open', streamId: 'bad', endpoint: 'fail', payload: { args: {} } })
    const response = JSON.parse(String((await failed)[0]))
    expect(response.type).toBe('error')
    expect(JSON.stringify(response)).not.toContain('must be redacted')
    send(client, { type: 'open', streamId: 'duplicate', endpoint: 'wait', payload: { args: {} } })
    const closed = once(client, 'close')
    send(client, { type: 'open', streamId: 'duplicate', endpoint: 'wait', payload: { args: {} } })
    expect((await closed)[0]).toBe(1008)
  })
  it.each([Buffer.from('binary'), '{not-json'])('rejects invalid frames', async (data) => {
    const { client } = await pair()
    const closed = once(client, 'close')
    client.send(data)
    expect((await closed)[0]).toBe(1008)
  })
})
