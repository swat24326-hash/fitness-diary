/**
 * Массовая клубная SMS-кампания: получатели, темп под лимит Мои Звонки, код подтверждения.
 * Отправка по одному через club-sms; blast-endpoint нет.
 */

import {
  CLIENT_HARD_DELETE_CONFIRM_CODE,
  isClientHardDeleteConfirmCode,
} from '../clientHardDeleteConfirmCore.js'
import { OUTREACH_TEMPLATE_LIMITS } from '../trainer/trainerClientOutreachCore.js'

/** Тот же код, что при жёстком удалении клиента. */
export const CLUB_SMS_CAMPAIGN_CONFIRM_CODE = CLIENT_HARD_DELETE_CONFIRM_CODE

export const isClubSmsCampaignConfirmCode = isClientHardDeleteConfirmCode

/** Согласовано с api/_lib/moiZvonkiCore.js — не слать быстрее лимита. */
export const CLUB_SMS_CAMPAIGN_RATE_PER_MIN = 20

export const CLUB_SMS_CAMPAIGN_MAX_TEXT_LEN = OUTREACH_TEMPLATE_LIMITS.maxLength

/**
 * Номер пригоден для Мои Звонки (те же правила, что на сервере).
 * @param {string | null | undefined} raw
 */
export function normalizeClubSmsCampaignPhoneDigits(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10) d = `7${d}`
  return d
}

/**
 * @param {{ phone?: string | null } | null | undefined} client
 */
export function clientHasSendableClubSmsPhone(client) {
  const d = normalizeClubSmsCampaignPhoneDigits(client?.phone)
  return d.length >= 11 && d.length <= 15 && /^\d+$/.test(d)
}

/**
 * @param {Iterable<string | number>} ids
 * @returns {Set<string>}
 */
export function normalizeClubSmsCampaignIdSet(ids) {
  const out = new Set()
  for (const raw of ids ?? []) {
    const id = String(raw ?? '').trim()
    if (id) out.add(id)
  }
  return out
}

/**
 * @param {Array<{ id?: string, name?: string, phone?: string | null }>} clients
 * @returns {{
 *   eligible: Array<{ id: string, name: string, phone: string }>,
 *   skippedNoPhone: Array<{ id: string, name: string }>,
 * }}
 */
export function partitionClubSmsCampaignClients(clients) {
  /** @type {Array<{ id: string, name: string, phone: string }>} */
  const eligible = []
  /** @type {Array<{ id: string, name: string }>} */
  const skippedNoPhone = []
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    const name = String(c?.name ?? '').trim() || 'Без имени'
    if (clientHasSendableClubSmsPhone(c)) {
      eligible.push({
        id,
        name,
        phone: String(c.phone ?? '').trim(),
      })
    } else {
      skippedNoPhone.push({ id, name })
    }
  }
  return { eligible, skippedNoPhone }
}

/**
 * @param {Set<string> | Iterable<string>} selectedIds
 * @param {Array<{ id: string, name: string, phone: string }>} eligible
 */
export function resolveClubSmsCampaignRecipients(selectedIds, eligible) {
  const set = selectedIds instanceof Set ? selectedIds : normalizeClubSmsCampaignIdSet(selectedIds)
  return (eligible ?? []).filter((r) => set.has(r.id))
}

/**
 * Пауза между SMS, чтобы уложиться в лимит клуба (20/мин).
 * @param {{ ratePerMin?: number }} [opts]
 */
export function clubSmsCampaignPaceDelayMs(opts = {}) {
  const rate = Number(opts.ratePerMin) > 0 ? Number(opts.ratePerMin) : CLUB_SMS_CAMPAIGN_RATE_PER_MIN
  return Math.ceil(60_000 / rate)
}

/**
 * @param {number} count
 * @param {{ ratePerMin?: number }} [opts]
 */
export function estimateClubSmsCampaignDurationSec(count, opts = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n <= 1) return 0
  const delayMs = clubSmsCampaignPaceDelayMs(opts)
  return Math.ceil(((n - 1) * delayMs) / 1000)
}

/**
 * @param {number} sec
 */
export function formatClubSmsCampaignDurationRu(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  if (s < 60) return `~${s} с`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (rem === 0) return `~${m} мин`
  return `~${m} мин ${rem} с`
}

/**
 * @param {string} raw
 */
export function normalizeClubSmsCampaignText(raw) {
  return String(raw ?? '').trim().slice(0, CLUB_SMS_CAMPAIGN_MAX_TEXT_LEN)
}

/**
 * Сводка для окна подтверждения.
 * @param {{
 *   recipients: Array<{ id: string, name: string, phone?: string }>,
 *   text: string,
 *   namePreviewLimit?: number,
 * }} opts
 */
export function buildClubSmsCampaignConfirmSummary(opts) {
  const recipients = Array.isArray(opts.recipients) ? opts.recipients : []
  const text = normalizeClubSmsCampaignText(opts.text)
  const limit = Number(opts.namePreviewLimit) > 0 ? Number(opts.namePreviewLimit) : 8
  const names = recipients.map((r) => r.name)
  const namePreview = names.slice(0, limit)
  const namesHidden = Math.max(0, names.length - namePreview.length)
  const durationSec = estimateClubSmsCampaignDurationSec(recipients.length)
  return {
    count: recipients.length,
    text,
    textLength: text.length,
    namePreview,
    namesHidden,
    durationSec,
    durationLabel: formatClubSmsCampaignDurationRu(durationSec),
    canLaunch: recipients.length > 0 && text.length > 0,
  }
}

/**
 * @param {Set<string>} selected
 * @param {string} clientId
 * @param {boolean} checked
 * @returns {Set<string>}
 */
export function toggleClubSmsCampaignSelection(selected, clientId, checked) {
  const id = String(clientId ?? '').trim()
  const next = new Set(selected ?? [])
  if (!id) return next
  if (checked) next.add(id)
  else next.delete(id)
  return next
}

/**
 * @param {Array<{ id: string }>} eligible
 * @returns {Set<string>}
 */
export function selectAllClubSmsCampaignEligible(eligible) {
  return normalizeClubSmsCampaignIdSet((eligible ?? []).map((r) => r.id))
}
