/**
 * admin-data?action=staff-link — совмещённые роли «тренер + управляющий» (только главный админ).
 * GET  → { links: [{ supervisor_id, trainer_id }], available }
 * POST { supervisor_id, trainer_id | null } → { ok } (null — снять связь)
 * Правило — src/lib/chat/linkedStaffCore.js; что даёт связь — docs/CHAT.md «Совмещённые роли».
 */
import { sendJson } from '../adminSupabase.js'
import { staffLinkCheck, staffLinksOf } from '../../../src/lib/chat/linkedStaffCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { LINK_FIELDS, isMissingLinkColumn } from '../chat/linkedStaffStore.js'
import { rows } from '../inbox/inboxStore.js'

const UNAVAILABLE_RU = 'Связь учёток пока недоступна — нужна миграция базы'

async function loadUser(db, id) {
  if (!isInboxUuid(id)) return undefined
  const found = await rows(db.from('users').select(LINK_FIELDS).eq('id', String(id).trim()))
  return found[0] ?? undefined
}

export async function handleStaffLinkGet(ctx, res) {
  try {
    const linked = await rows(ctx.supabaseAdmin.from('users').select(LINK_FIELDS).not('linked_user_id', 'is', null))
    sendJson(res, 200, { links: staffLinksOf(linked), available: true })
  } catch (e) {
    if (!isMissingLinkColumn(e)) throw e
    sendJson(res, 200, { links: [], available: false })
  }
}

export async function handleStaffLinkPost(ctx, res, body) {
  const db = ctx.supabaseAdmin
  try {
    const supervisor = await loadUser(db, body?.supervisor_id)
    const trainer = body?.trainer_id == null || body.trainer_id === '' ? null : await loadUser(db, body.trainer_id)
    const check = staffLinkCheck(supervisor, trainer)
    if (!check.ok) {
      sendJson(res, 400, { error: check.error })
      return
    }
    const ids = [String(supervisor.id), ...(trainer ? [String(trainer.id)] : [])]
    await rows(db.from('users').update({ linked_user_id: null }).in('linked_user_id', ids).select('id'))
    await rows(db.from('users').update({ linked_user_id: null }).in('id', ids).select('id'))
    if (trainer) {
      await rows(db.from('users').update({ linked_user_id: trainer.id }).eq('id', supervisor.id).select('id'))
      await rows(db.from('users').update({ linked_user_id: supervisor.id }).eq('id', trainer.id).select('id'))
    }
    sendJson(res, 200, { ok: true })
  } catch (e) {
    if (!isMissingLinkColumn(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
