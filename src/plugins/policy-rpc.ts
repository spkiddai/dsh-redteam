import type { Context } from '@deepseek-ai/cordis'
import { clientRequestSchema, type ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'

export async function policyFetch(
  handler: ConnectionRpcHandler,
  request: Request,
  peer: PeerScope,
): Promise<Response> {
  const method = new URL(request.url).pathname.slice('/api/'.length)
  const message = clientRequestSchema.safeParse(await request.json().catch(() => null))
  if (request.method !== 'POST' || !message.success || message.data.method !== method)
    return new Response('Invalid request', { status: 400 })
  const result = await handler(
    method.slice('redteam-policy/'.length),
    message.data.payload,
    request.signal,
    peer,
  )
  return Response.json(
    { type: 'server-response', rpcId: message.data.rpcId, result },
    { headers: { 'cache-control': 'no-store' } },
  )
}
/** rc.2 reserves its sole shared interceptor for the native gateway. */
export function registerPolicyRpc(
  ctx: Context,
  handler: ConnectionRpcHandler,
): ConnectionRpcHandler {
  for (const endpoint of ['get', 'update', 'connections', 'connect', 'confirm-permissions'])
    ctx.connection.fetch.register({
      path: `/api/redteam-policy/${endpoint}`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => policyFetch(handler, request, ctx.connection.browserPeer),
    })
  return handler
}
