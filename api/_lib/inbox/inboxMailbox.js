/**
 * Свои доставки получателя «Входящих»: клиент (client_id) или сотрудник (user_id).
 * Владелец всегда из проверенного токена — чужую доставку не открыть и не ответить.
 * Возвращает { status, body } — отправку делает тонкий handler.
 */
import { isInboxCampaignOpen, isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { normalizeInboxAnswers } from '../../../src/lib/inbox/inboxAnswersCore.js'
import { buildClientInboxItem, countInboxAttention } from '../../../src/lib/inbox/inboxClientViewCore.js'
import { rows } from './inboxStore.js'

const LIST_LIMIT = 50
const NOT_FOUND_RU = 'Сообщение не найдено'
const ANSWERED_RU = 'Вы уже ответили на этот опрос — спасибо!'
const DELIVERY_FIELDS = 'id, campaign_id, created_at, read_at, answered_at, answers, reward_points'

export function isMissingInboxTable(e) {
  const msg = String(e?.message ?? '')
  return /inbox_(deliveries|campaigns)|user_id/.test(msg) && /does not exist|relation|column/i.test(msg)
}

/** @param {'client_id'|'user_id'} column */
export function inboxMailbox(db, column, ownerId) {
  async function loadPairs() {
    const deliveries = await rows(
      db
        .from('inbox_deliveries')
        .select(DELIVERY_FIELDS)
        .eq(column, ownerId)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT),
    )
    if (!deliveries.length) return []
    const ids = [...new Set(deliveries.map((d) => String(d.campaign_id)))]
    const byId = new Map((await rows(db.from('inbox_campaigns').select('*').in('id', ids))).map((c) => [String(c.id), c]))
    return deliveries.map((delivery) => ({ delivery, campaign: byId.get(String(delivery.campaign_id)) })).filter((p) => p.campaign)
  }

  async function loadOwnPair(id) {
    if (!isInboxUuid(id)) return null
    const { data, error } = await db
      .from('inbox_deliveries')
      .select(DELIVERY_FIELDS)
      .eq('id', String(id).trim())
      .eq(column, ownerId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: campaign, error: cErr } = await db.from('inbox_campaigns').select('*').eq('id', data.campaign_id).maybeSingle()
    if (cErr) throw cErr
    return campaign ? { delivery: data, campaign } : null
  }

  return {
    /** Число для точки на конверте. До миграции — 0, экран не ломаем. */
    async attention() {
      try {
        return countInboxAttention(await loadPairs())
      } catch (e) {
        if (isMissingInboxTable(e)) return 0
        throw e
      }
    },

    async list() {
      const pairs = await loadPairs()
      const nowIso = new Date().toISOString()
      return {
        status: 200,
        body: { items: pairs.map((p) => buildClientInboxItem(p.delivery, p.campaign, nowIso)), attention: countInboxAttention(pairs, nowIso) },
      }
    },

    /** Открыть сообщение; первое открытие отмечает прочитанным. */
    async item(id) {
      const pair = await loadOwnPair(id)
      if (!pair) return { status: 404, body: { error: NOT_FOUND_RU } }
      if (!pair.delivery.read_at) {
        const readAt = new Date().toISOString()
        await rows(db.from('inbox_deliveries').update({ read_at: readAt }).eq('id', pair.delivery.id).is('read_at', null).select('id'))
        pair.delivery = { ...pair.delivery, read_at: readAt }
      }
      return { status: 200, body: { item: buildClientInboxItem(pair.delivery, pair.campaign, undefined, true) } }
    },

    /** Ответ на опрос — один раз, пока опрос открыт; повтор отсекает answered_at IS NULL. Баллы начисляются тут же. */
    async answer(id, rawAnswers) {
      const pair = await loadOwnPair(id)
      if (!pair || pair.campaign.kind !== 'survey') return { status: 404, body: { error: NOT_FOUND_RU } }
      if (pair.delivery.answered_at) return { status: 409, body: { error: ANSWERED_RU } }
      if (!isInboxCampaignOpen(pair.campaign)) return { status: 409, body: { error: 'Опрос закрыт — ответы больше не принимаются' } }
      const checked = normalizeInboxAnswers(pair.campaign.questions ?? [], rawAnswers)
      if (!checked.ok) return { status: 400, body: { error: checked.error } }
      const nowIso = new Date().toISOString()
      const saved = await rows(
        db
          .from('inbox_deliveries')
          .update({
            answers: checked.answers,
            answered_at: nowIso,
            read_at: pair.delivery.read_at ?? nowIso,
            reward_granted_at: Number(pair.delivery.reward_points) > 0 ? nowIso : null,
          })
          .eq('id', pair.delivery.id)
          .is('answered_at', null)
          .select(DELIVERY_FIELDS),
      )
      if (!saved.length) return { status: 409, body: { error: ANSWERED_RU } }
      return { status: 200, body: { item: buildClientInboxItem(saved[0], pair.campaign, nowIso, true) } }
    },
  }
}
