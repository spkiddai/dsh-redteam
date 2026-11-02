import { WebSocket, type RawData } from 'ws'
import { parseRemoteStreamClientMessage } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import type { TeamPeer } from './team-bridge.js'

/** Bounded transport queue only; all RPC validation and execution belongs to DSH. */
export class StreamInbox implements AsyncIterable<unknown> {
  private values: { value: unknown; bytes: number }[] = []
  private bytes = 0
  private ended = false
  private wake: (() => void) | undefined
  push(value: unknown) {
    if (this.ended) throw new Error('stream ended')
    const bytes = Buffer.byteLength(JSON.stringify(value) ?? 'null')
    if (this.bytes + bytes > 262144 || this.values.length >= 256) throw new Error('stream overflow')
    this.values.push({ value, bytes })
    this.bytes += bytes
    this.wake?.()
  }
  end() {
    this.ended = true
    this.wake?.()
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const next = this.values.shift()
      if (next) {
        this.bytes -= next.bytes
        yield next.value
      } else if (this.ended) return
      else
        await new Promise<void>((resolve) => {
          this.wake = resolve
        })
    }
  }
}
export function connectTeamStream(socket: WebSocket, peer: TeamPeer) {
  const streams = new Map<string, { control: AbortController; inbox: StreamInbox }>()
  const send = (value: unknown) => {
    if (socket.bufferedAmount > 4 * 1024 * 1024) {
      socket.close(1013)
      return
    }
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
  }
  socket.on('message', (raw: RawData, binary) => {
    try {
      if (binary) throw new Error('text frames required')
      const frame = parseRemoteStreamClientMessage(raw.toString())
      if (frame.type === 'open') {
        if (streams.has(frame.streamId) || streams.size >= 64) throw new Error('stream limit')
        const control = new AbortController(),
          inbox = new StreamInbox()
        streams.set(frame.streamId, { control, inbox })
        void (async () => {
          try {
            for await (const value of peer.stream(
              frame.endpoint,
              frame.payload,
              inbox,
              control.signal,
            ))
              send({ type: 'item', streamId: frame.streamId, value })
            send({ type: 'end', streamId: frame.streamId })
          } catch {
            send({
              type: 'error',
              streamId: frame.streamId,
              error: {
                code: 'remote-access/denied',
                message: '会话不可用或无操作权限。',
                details: {},
              },
            })
          } finally {
            streams.delete(frame.streamId)
            inbox.end()
            control.abort()
          }
        })()
      } else {
        const stream = streams.get(frame.streamId)
        if (!stream) return
        if (frame.type === 'item') stream.inbox.push(frame.value)
        else if (frame.type === 'end') stream.inbox.end()
        else {
          stream.control.abort()
          stream.inbox.end()
        }
      }
    } catch {
      socket.close(1008, 'Invalid stream message')
    }
  })
  socket.on('error', () => socket.terminate())
  socket.once('close', () => {
    for (const stream of streams.values()) {
      stream.control.abort()
      stream.inbox.end()
    }
    streams.clear()
  })
}
