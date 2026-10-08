/**
 * «Входящие» клиента через /api/client-me (токен клиента, только свои доставки).
 * POST { action: 'inbox-list' } (+ points — баланс баллов за опросы) | { action: 'inbox-item', id } (отмечает прочитанным) | { action: 'inbox-answer', id, answers }
 */
import { sendJson } from '../adminSupabase.js'
import { inboxMailbox, isMissingInboxTable } from './inboxMailbox.js'
import { ensureMilestoneSurveys } from './inboxMilestoneJob.js'
import { loadSurveyPointsBalance } from './inboxPointsStore.js'

/** Число для точки на конверте (GET /api/client-me). Сначала доставляем положенный автоопрос — сбой не мешает /me. */
export async function loadClientInboxAttention(db, clientId) {
  await ensureMilestoneSurveys(db, clientId, { knownSession: true }).catch((e) => {
    if (!isMissingInboxTable(e) && !/trigger/.test(String(e?.message ?? ''))) console.warn('[inbox-milestone]', e?.message || e)
  })
  return inboxMailbox(db, 'client_id', clientId).attention()
}

export async function handleClientInboxPost(db, ctx, body, res) {
  const box = inboxMailbox(db, 'client_id', ctx.clientId)
  const out =
    body.action === 'inbox-item'
      ? await box.item(body.id)
      : body.action === 'inbox-answer'
        ? await box.answer(body?.id, body?.answers)
        : await box.list()
  if (body.action === 'inbox-list' && out.status === 200) {
    out.body.points = await loadSurveyPointsBalance(db, ctx.clientId)
  }
  sendJson(res, out.status, out.body)
}
