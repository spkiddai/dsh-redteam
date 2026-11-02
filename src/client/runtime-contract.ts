/** Narrow dashboard-facing contracts for DSH 0.1.2's split client runtime. */

export type SessionId = string

export interface ObservableSnapshot<Value> {
  getSnapshot(): Value
  subscribe(listener: () => void): () => void
}

export interface ContentBlock {
  readonly text?: string
  readonly type: string
}

export interface ToolResultNode {
  readonly call: { readonly name: string; readonly argsRaw?: string } | null
  readonly callId: string
  readonly content: readonly ContentBlock[]
  readonly isError: boolean
  readonly kind: 'tool-result'
  readonly seq: number
}

export interface ConversationNode {
  readonly blocks?: readonly { readonly kind: string; readonly text?: string }[]
  readonly call?: { readonly name: string; readonly argsRaw?: string } | null
  readonly callId?: string
  readonly content?: readonly ContentBlock[]
  readonly isError?: boolean
  readonly kind: string
  readonly seq: number
  readonly usage?: unknown
}

export interface PartialAssistant {
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  readonly step: number
  readonly turn: number
}

export interface RunningToolCall {
  readonly name: string
}

/** Normalized dashboard read model produced from either DSH client architecture. */
export interface DashboardConversationSnapshot {
  readonly hasMore: boolean
  readonly loadingOlder: boolean
  readonly nodes: readonly ConversationNode[]
  readonly partial: PartialAssistant | null
  readonly running: boolean
  readonly runningCalls: readonly RunningToolCall[]
}

export interface DashboardConversationSource extends ObservableSnapshot<
  DashboardConversationSnapshot | undefined
> {}

export interface SessionFaceLike extends ObservableSnapshot<unknown> {
  loadOlder(): Promise<void>
  prompt(
    content: readonly { readonly text: string; readonly type: 'text' }[],
    mode: 'queue' | 'steer',
  ): Promise<
    | { readonly ok: true; readonly value?: unknown }
    | { readonly error: { readonly message: string }; readonly ok: false }
  >
  readonly projections?: {
    faceOf(key: string): ObservableSnapshot<unknown>
  }
}

export interface SessionSummaryLike {
  readonly cwd?: string
  readonly projectionValues?: Readonly<Record<string, unknown>>
}

export interface SessionListStateLike {
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
  readonly current: SessionId | undefined
}

export type UseSessionsLike = <Selected>(
  selector: (state: SessionListStateLike) => Selected,
) => Selected

export function isRedteamSession(summary: SessionSummaryLike | undefined): boolean {
  return summary?.projectionValues?.agentPreset === 'redteam'
}
