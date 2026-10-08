/**
 * Что клиент видит во «Входящих» — белый список: без id клубов, автора и чужих ответов.
 * Точка на конверте горит, пока есть непрочитанное или непройденный открытый опрос.
 */
import { isInboxCampaignOpen } from './inboxCampaignCore.js'

/** @returns {'new'|'read'|'answered'} */
export function inboxDeliveryStatus(delivery) {
  if (delivery?.answered_at) return 'answered'
  return delivery?.read_at ? 'read' : 'new'
}

export function inboxNeedsAttention(delivery, campaign, nowIso) {
  if (!campaign) return false
  if (!delivery?.read_at) return true
  return campaign.kind === 'survey' && !delivery.answered_at && isInboxCampaignOpen(campaign, nowIso)
}

/**
 * @param {Array<{ delivery: object, campaign: object }>} pairs
 */
export function countInboxAttention(pairs, nowIso = new Date().toISOString()) {
  return (pairs ?? []).filter((p) => inboxNeedsAttention(p.delivery, p.campaign, nowIso)).length
}

function questionView(q) {
  const out = { id: q.id, type: q.type, text: q.text, required: q.required !== false }
  if (Array.isArray(q.options)) out.options = q.options
  return out
}

/**
 * Строка списка; full — ещё текст, вопросы и свои ответы (экран сообщения).
 * @param {object} delivery inbox_deliveries
 * @param {object} campaign inbox_campaigns
 */
export function buildClientInboxItem(delivery, campaign, nowIso = new Date().toISOString(), full = false) {
  const item = {
    id: String(delivery.id),
    kind: campaign.kind,
    title: campaign.title,
    sent_at: delivery.created_at,
    status: inboxDeliveryStatus(delivery),
    open: campaign.kind === 'survey' ? isInboxCampaignOpen(campaign, nowIso) : true,
    reward_points: campaign.kind === 'survey' ? Number(delivery.reward_points) || 0 : 0,
    attention: inboxNeedsAttention(delivery, campaign, nowIso),
  }
  if (!full) return item
  item.body = campaign.body || ''
  if (campaign.kind === 'survey') {
    item.questions = (campaign.questions ?? []).map(questionView)
    item.answers = delivery.answered_at ? delivery.answers ?? {} : null
  }
  return item
}
