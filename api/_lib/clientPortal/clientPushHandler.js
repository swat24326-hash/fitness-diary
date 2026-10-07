/**
 * POST /api/client-me { action: 'push-status' | 'push-subscribe' | 'push-unsubscribe' } — напоминания на этот телефон.
 * Только после requireClientUser: строки только своего client_id, подписка привязана к текущей сессии.
 */
import { sendJson } from '../adminSupabase.js'
import { normalizePushUnsubscribePayload, normalizeVapidPublicKey } from '../../../src/lib/push/trainerPushCore.js'
import { isWebPushConfigured } from '../webPushCore.js'
import { normalizeClientPushSubscribe } from './clientPushCore.js'

const TABLE = 'client_push_subscriptions'

function vapidPublicKey() {
  return normalizeVapidPublicKey(process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '')
}

async function status(db, ctx, body, res) {
  const endpoint = String(body?.endpoint ?? '').trim()
  let subscribed = false
  if (endpoint) {
    const { data, error } = await db
      .from(TABLE)
      .select('id')
      .eq('client_id', ctx.clientId)
      .eq('session_id', ctx.sid)
      .eq('endpoint', endpoint)
      .maybeSingle()
    if (error) throw error
    subscribed = !!data
  }
  sendJson(res, 200, { configured: isWebPushConfigured(), public_key: vapidPublicKey(), subscribed })
}

async function subscribe(db, ctx, body, res) {
  if (!isWebPushConfigured()) {
    sendJson(res, 503, { error: 'Напоминания пока не настроены — попробуйте позже' })
    return
  }
  const n = normalizeClientPushSubscribe(body)
  if (!n.ok) {
    sendJson(res, 400, { error: n.error })
    return
  }
  // Телефон = один клиент: endpoint уникален, повторная подписка переписывает владельца и сессию.
  const { error } = await db.from(TABLE).upsert(
    {
      client_id: ctx.clientId,
      session_id: ctx.sid,
      club_id: ctx.client?.club_id ?? null,
      endpoint: n.payload.endpoint,
      p256dh: n.payload.p256dh,
      auth: n.payload.auth,
      user_agent: n.payload.user_agent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  sendJson(res, 200, { ok: true, subscribed: true })
}

async function unsubscribe(db, ctx, body, res) {
  const n = normalizePushUnsubscribePayload(body)
  if (!n.ok) {
    sendJson(res, 400, { error: n.error })
    return
  }
  const { error } = await db.from(TABLE).delete().eq('client_id', ctx.clientId).eq('endpoint', n.endpoint)
  if (error) throw error
  sendJson(res, 200, { ok: true, subscribed: false })
}

const ACTIONS = { 'push-status': status, 'push-subscribe': subscribe, 'push-unsubscribe': unsubscribe }

export async function handleClientPushPost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null
  if (!run) {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  await run(db, ctx, body, res)
}
