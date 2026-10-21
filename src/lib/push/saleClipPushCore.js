/**
 * Текст пуша тренеру: абонемент уже создан менеджером, на планшете нужен Sync.
 * Без отправки и без React / IDB.
 */

import { pluralRu } from '../client/clientMeUiCore.js'
import { formatClientName } from '../clientNameFormat.js'
import { formatDateRu } from '../dateRu.js'

/**
 * @param {unknown} iso
 * @returns {string}
 */
function ruDateOrEmpty(iso) {
  const raw = String(iso ?? '').trim()
  if (!raw) return ''
  const formatted = formatDateRu(raw)
  return formatted && formatted !== '—' ? formatted : ''
}

/**
 * @param {{
 *   clientName?: unknown,
 *   membershipTypeLabel?: unknown,
 *   totalTrainings?: unknown,
 *   endDate?: unknown,
 *   activePackageEnd?: unknown,
 *   wasPnk?: boolean,
 * }} [input]
 * @returns {{ title: string, body: string }}
 */
export function buildSaleClipTrainerPush(input = {}) {
  const name = formatClientName(input.clientName) || 'Клиент'
  const typeLabel = String(input.membershipTypeLabel ?? '').trim() || 'абонемент'
  const total = Number(input.totalTrainings)
  const countPart = Number.isFinite(total)
    ? `, ${Math.trunc(total)} ${pluralRu(total, 'занятие', 'занятия', 'занятий')}`
    : ''
  const end = ruDateOrEmpty(input.endDate)
  const endPart = end ? `, до ${end}` : ''
  const parts = [
    `${name}: создан ${typeLabel}${countPart}${endPart}. На планшете нажмите Синхронизировать — тогда пакет будет в дневнике.`,
  ]

  const liveUntil = ruDateOrEmpty(input.activePackageEnd)
  if (liveUntil) parts.push(`Сейчас ещё действует пакет до ${liveUntil}.`)
  if (input.wasPnk === true) parts.push('Продажа закрыла воронку ПНК.')

  return {
    title: 'Новый абонемент',
    body: parts.join(' '),
  }
}

/**
 * Конец другого пакета, который ещё действует в день клипа.
 * Пакет этой продажи (excludeId) не считаем «старым».
 * @param {object[]|null|undefined} memberships
 * @param {unknown} asOf
 * @param {unknown} [excludeId]
 * @returns {string}
 */
export function activeSaleClipPackageEnd(memberships, asOf, excludeId) {
  const day = String(asOf ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const skip = String(excludeId ?? '').trim()
  const live = (memberships ?? []).find((m) => {
    if (skip && String(m?.id ?? '') === skip) return false
    const start = String(m?.start_date ?? '').slice(0, 10)
    const end = String(m?.end_date ?? '').slice(0, 10)
    return Boolean(start && end && start <= day && end >= day)
  })
  return live ? String(live.end_date).slice(0, 10) : ''
}
