import webpush from 'web-push'
import { buildDispatchPushPayload } from '../../src/lib/push/trainerPushCore.js'
import {
  buildDispatchSenderStatusPushPayload,
  shouldNotifySenderOnDispatchStatus,
  shouldSkipSenderPush,
} from '../../src/lib/admin/iskraDispatchSenderPushCore.js'

let configured = false

/**
 * @returns {boolean}
 */
export function isWebPushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function ensureConfigured() {
  if (configured || !isWebPushConfigured()) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:push@fit-city.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  configured = true
  return true
}

/**
 * @param {{ endpoint: string, p256dh: string, auth: string }} row
 * @param {{ title?: string, body?: string, url?: string, tag?: string }} payload
 */
export async function sendWebPushToRow(row, payload) {
  if (!ensureConfigured()) return { ok: false, skipped: true, reason: 'not_configured' }

  const msg = buildDispatchPushPayload(payload)
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      JSON.stringify(msg),
    )
    return { ok: true }
  } catch (e) {
    const status = Number(e?.statusCode ?? 0)
    return {
      ok: false,
      expired: status === 404 || status === 410,
      error: e?.message ? String(e.message) : 'push_failed',
    }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {{ title?: string, body?: string, url?: string, tag?: string }} payload
 */
export async function sendPushToUser(supabaseAdmin, userId, payload) {
  if (!ensureConfigured()) return { ok: true, sent: 0, skipped: true, reason: 'not_configured' }

  const { data, error } = await supabaseAdmin
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    if (/does not exist|relation.*user_push_subscriptions/i.test(String(error.message ?? ''))) {
      return { ok: true, sent: 0, skipped: true, reason: 'migration_pending' }
    }
    throw error
  }

  const rows = data ?? []
  if (!rows.length) return { ok: true, sent: 0, reason: 'no_subscription' }

  let sent = 0
  let failed = 0
  const expiredIds = []

  for (const row of rows) {
    const result = await sendWebPushToRow(row, payload)
    if (result.ok) sent += 1
    else if (result.expired) expiredIds.push(row.id)
    else failed += 1
  }

  if (expiredIds.length) {
    await supabaseAdmin.from('user_push_subscriptions').delete().in('id', expiredIds)
  }

  return {
    ok: true,
    sent,
    failed,
    expired: expiredIds.length,
    reason: sent > 0 ? undefined : failed > 0 ? 'send_failed' : 'no_subscription',
  }
}

/**
 * @param {object} ctx
 * @param {Array<{ recipient_user_id?: string, title?: string, body?: string }>} items
 */
export async function notifyDispatchPushForRecipients(ctx, items) {
  if (!ensureConfigured() || !items?.length) return

  const byUser = new Map()
  for (const item of items) {
    const uid = String(item?.recipient_user_id ?? '').trim()
    if (!uid) continue
    if (!byUser.has(uid)) byUser.set(uid, item)
  }

  const tasks = []
  for (const [userId, item] of byUser) {
    tasks.push(
      sendPushToUser(ctx.supabaseAdmin, userId, {
        title: 'Новое задание',
        body: String(item?.title ?? 'Откройте Планёрку'),
        url: '/trainer?inbox=1',
        tag: `dispatch-${String(item?.id ?? userId)}`,
      }),
    )
  }

  await Promise.allSettled(tasks)
}

/**
 * Push отправителю задания: исполнитель принял или выполнил.
 * @param {object} ctx
 * @param {{ id?: string, club_id?: string, sender_user_id?: string, recipient_user_id?: string, title?: string }} dispatchRow
 * @param {string} newStatus
 * @param {{ recipientName?: string }} [opts]
 */
export async function notifyDispatchStatusPushToSender(ctx, dispatchRow, newStatus, opts = {}) {
  if (!ensureConfigured()) return
  const status = String(newStatus ?? '').trim()
  if (!shouldNotifySenderOnDispatchStatus(status)) return
  if (shouldSkipSenderPush(dispatchRow?.sender_user_id, dispatchRow?.recipient_user_id)) return

  const senderId = String(dispatchRow?.sender_user_id ?? '').trim()
  const payload = buildDispatchSenderStatusPushPayload({
    status: /** @type {import('../../src/lib/admin/iskraDispatchSenderPushCore.js').DispatchSenderPushStatus} */ (status),
    dispatchId: String(dispatchRow?.id ?? ''),
    clubId: String(dispatchRow?.club_id ?? ''),
    taskTitle: String(dispatchRow?.title ?? ''),
    recipientName: opts.recipientName ?? '',
  })
  if (!payload) return

  await sendPushToUser(ctx.supabaseAdmin, senderId, payload)
}
