/**
 * Ориентир «когда вернётся» для чипа «Вернётся позже».
 * Без React / IDB.
 */

import { addMonthsToIso, formatDateRu, todayLocalIso } from './dateRu.js'

export const ARCHIVE_RETURN_LATER_ID = 'return_later'

export const ARCHIVE_RETURN_LATER_LABEL = 'Вернётся позже'

/** Пресеты горизонта (планшет). */
export const ARCHIVE_RETURN_HORIZONS = Object.freeze([
  { id: '1m', label: 'Через 1 мес.', months: 1 },
  { id: '2m', label: 'Через 2 мес.', months: 2 },
  { id: '3m', label: 'Через 3 мес.', months: 3 },
  { id: '6m', label: 'Через полгода', months: 6 },
  { id: 'custom', label: 'Своя дата', months: null },
])

/**
 * @param {unknown} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function normalizeExpectedReturnOn(raw) {
  const s = String(raw ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/**
 * @param {string} [asOf] YYYY-MM-DD
 * @param {string|null|undefined} horizonId
 * @param {string|null|undefined} customDate
 * @returns {string | null}
 */
export function resolveExpectedReturnOn(asOf, horizonId, customDate) {
  const id = String(horizonId ?? '').trim()
  if (!id) return null
  if (id === 'custom') return normalizeExpectedReturnOn(customDate)
  const horizon = ARCHIVE_RETURN_HORIZONS.find((h) => h.id === id)
  if (!horizon || horizon.months == null) return null
  const base = normalizeExpectedReturnOn(asOf) || todayLocalIso()
  return addMonthsToIso(base, horizon.months)
}

/**
 * Текст причины со сроком: «Вернётся позже · до 20.09.2026».
 * @param {string|null|undefined} expectedReturnOn
 */
export function composeReturnLaterReason(expectedReturnOn) {
  const d = normalizeExpectedReturnOn(expectedReturnOn)
  if (!d) return null
  return `${ARCHIVE_RETURN_LATER_LABEL} · до ${formatDateRu(d)}`
}

/**
 * @param {unknown} reasonText
 */
export function isReturnLaterReasonText(reasonText) {
  const r = String(reasonText ?? '').trim()
  if (!r) return false
  return r === ARCHIVE_RETURN_LATER_LABEL || r.startsWith(`${ARCHIVE_RETURN_LATER_LABEL} ·`)
}

/**
 * Достать дату из текста причины (если колонки ещё нет / старый кэш).
 * @param {unknown} reasonText
 * @returns {string | null}
 */
export function parseExpectedReturnOnFromReason(reasonText) {
  const r = String(reasonText ?? '').trim()
  const m = r.match(/до\s+(\d{2})\.(\d{2})\.(\d{4})\s*$/i)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/**
 * Дата ожидания с клиента (колонка или разбор текста).
 * @param {{ expected_return_on?: unknown, archive_reason?: unknown } | null | undefined} client
 */
export function getClientExpectedReturnOn(client) {
  return (
    normalizeExpectedReturnOn(client?.expected_return_on) ||
    parseExpectedReturnOnFromReason(client?.archive_reason)
  )
}

/**
 * Подсказка на карточке / в списке.
 * @param {{ expected_return_on?: unknown, archive_reason?: unknown, archived_at?: unknown } | null | undefined} client
 * @param {string} [asOf]
 * @returns {string | null}
 */
export function formatExpectedReturnHint(client, asOf = todayLocalIso()) {
  if (!client?.archived_at) return null
  const d = getClientExpectedReturnOn(client)
  if (!d) {
    if (isReturnLaterReasonText(client?.archive_reason)) return 'Срок возврата не указан'
    return null
  }
  const today = normalizeExpectedReturnOn(asOf) || todayLocalIso()
  if (d < today) return `Срок прошёл (${formatDateRu(d)}) — пора связаться`
  if (d === today) return `Ждём сегодня (${formatDateRu(d)})`
  return `Ждём до ${formatDateRu(d)}`
}

/**
 * Подобрать горизонт для модалки по сохранённой дате.
 * @param {string|null|undefined} expectedReturnOn
 * @param {string} [asOf]
 * @returns {{ horizonId: string | null, customDate: string }}
 */
export function matchReturnHorizon(expectedReturnOn, asOf = todayLocalIso()) {
  const d = normalizeExpectedReturnOn(expectedReturnOn)
  if (!d) return { horizonId: null, customDate: '' }
  const base = normalizeExpectedReturnOn(asOf) || todayLocalIso()
  for (const h of ARCHIVE_RETURN_HORIZONS) {
    if (h.months == null) continue
    if (addMonthsToIso(base, h.months) === d) {
      return { horizonId: h.id, customDate: '' }
    }
  }
  return { horizonId: 'custom', customDate: d }
}
