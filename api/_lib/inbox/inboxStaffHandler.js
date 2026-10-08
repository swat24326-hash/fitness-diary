/**
 * admin-data?action=my-inbox — «Входящие» сотрудника (тренер, менеджер продаж, управляющий).
 * GET  → { items, attention }
 * POST { op: 'item', id } (отмечает прочитанным) | { op: 'answer', id, answers }
 */
import { sendJson } from '../adminSupabase.js'
import { isInboxStaffRecipient } from '../../../src/lib/inbox/inboxAudienceCore.js'
import { inboxMailbox, isMissingInboxTable } from './inboxMailbox.js'

const NO_ACCESS_RU = 'Сообщения клуба доступны тренерам, менеджерам и управляющим'

function boxFor(ctx, res) {
  if (!isInboxStaffRecipient(ctx) || !ctx.user?.id) {
    sendJson(res, 403, { error: NO_ACCESS_RU })
    return null
  }
  return inboxMailbox(ctx.supabaseAdmin, 'user_id', String(ctx.user.id))
}

export async function handleStaffInboxGet(ctx, res) {
  const box = boxFor(ctx, res)
  if (!box) return
  try {
    const out = await box.list()
    sendJson(res, out.status, out.body)
  } catch (e) {
    if (!isMissingInboxTable(e)) throw e
    sendJson(res, 200, { items: [], attention: 0 })
  }
}

export async function handleStaffInboxPost(ctx, res, body) {
  const box = boxFor(ctx, res)
  if (!box) return
  const op = String(body?.op ?? '')
  if (op !== 'item' && op !== 'answer') {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  const out = op === 'item' ? await box.item(body.id) : await box.answer(body.id, body.answers)
  sendJson(res, out.status, out.body)
}
