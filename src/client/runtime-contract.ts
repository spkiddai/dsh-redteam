/** Narrow dashboard-facing contracts for DSH 0.2.1-rc.2. */

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

/** Normalized dashboard read model produced from the DSH Chat target and Session lifecycle. */
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
  readonly title?: string
  readonly id: SessionId
  readonly retainedBy: Readonly<{ mainView?: number }>
  readonly cwd?: string
  readonly projectionValues?: Readonly<Record<string, unknown>>
}

export interface SessionListStateLike {
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
}

export type UseSessionsLike = <Selected>(
  selector: (state: SessionListStateLike) => Selected,
) => Selected

export function isRedteamSession(summary: SessionSummaryLike | undefined): boolean {
  return summary?.projectionValues?.agentPreset === 'redteam'
}

/** The main view owns selection in DSH 0.2.1; catalog order is not selection. */
export function currentSession(state: SessionListStateLike): SessionSummaryLike | undefined {
  return Object.values(state.byId).find((session) => (session?.retainedBy.mainView ?? 0) > 0)
}
