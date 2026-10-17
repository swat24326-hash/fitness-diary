/**
 * Оценки клиентов для админа / управляющего (вкладка в «Опросы и объявления»).
 */
import { formatRatingScoreRu, normalizeRatingScore } from './clientRatingCore.js'

/** Push персоналу, если оценка строго ниже этой (четвёрка — норма). */
export const CLIENT_RATING_STAFF_ALERT_BELOW = 4

export function shouldAlertStaffOnClientRating(score) {
  const n = normalizeRatingScore(score)
  return n != null && n < CLIENT_RATING_STAFF_ALERT_BELOW
}

export function clientRatingIsLow(score) {
  return shouldAlertStaffOnClientRating(score)
}

/** Пути экрана оценок. */
export function adminInboxRatingsPath(base, { rid } = {}) {
  const root = String(base ?? '/admin/inbox').replace(/\?.*$/, '')
  const qs = new URLSearchParams({ tab: 'ratings' })
  if (rid) qs.set('rid', String(rid))
  return `${root}?${qs}`
}

/**
 * Строка списка для UI (белый список).
 * @param {object} row — join client_ratings + clients.name
 */
export function publicAdminRatingRow(row) {
  if (!row?.id || !row.answered_at) return null
  const score = normalizeRatingScore(row.score)
  if (score == null) return null
  const comment = row.comment != null ? String(row.comment).trim().slice(0, 300) : ''
  return {
    id: String(row.id),
    kind: String(row.kind ?? 'membership'),
    client_id: row.client_id ? String(row.client_id) : null,
    client_name: String(row.client_name ?? '').trim() || 'Клиент',
    club_id: row.club_id ? String(row.club_id) : null,
    club_name: row.club_name ? String(row.club_name).trim() : null,
    score,
    score_label: formatRatingScoreRu(score),
    comment,
    comment_preview: comment ? (comment.length > 80 ? `${comment.slice(0, 77)}…` : comment) : 'Без комментария',
    answered_at: String(row.answered_at),
    low: clientRatingIsLow(score),
  }
}

export function buildStaffRatingAlertPush({ clientName, score, comment, url }) {
  const label = formatRatingScoreRu(score)
  const name = String(clientName ?? '').trim() || 'Клиент'
  const bit = String(comment ?? '').trim().slice(0, 80)
  return {
    title: 'Оценка абонемента',
    body: bit ? `${name} · ${label}★ — ${bit}` : `${name} · ${label}★`,
    url: String(url ?? '/admin/inbox?tab=ratings'),
    tag: 'client-rating-low',
  }
}
