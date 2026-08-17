/**
 * Прайс-фолбэк для ориентира продлений (когда нет paid_amount в истории).
 * Точнее: ближайший пакет ТЗ/АЗ, медиана прайса ПЗ если тип не найден.
 */

import { inferDeskPackageDuration } from './deskMembershipLedgerCore.js'
import { getPriceListCell } from '../priceList/priceListCore.js'
import {
  PZ_DK_SUGGEST_MODE,
  PZ_DK_SUGGEST_PEOPLE,
  PZ_DK_SUGGEST_SESSIONS,
  resolvePackagePriceRub,
} from './salesPlanPzDkSuggestCore.js'
import { normalizeTzPriceListDocument } from '../priceList/tzPriceListCore.js'
import { getAzPriceListCell, normalizeAzPriceListDocument } from '../priceList/azPriceListCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'

/** @param {unknown} raw @returns {number|null} */
function positiveRub(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return roundPlanRub(n)
}

/** @param {number[]} values */
export function medianPositiveRub(values) {
  const list = (values ?? []).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  if (list.length % 2) return roundPlanRub(list[mid])
  return roundPlanRub((list[mid - 1] + list[mid]) / 2)
}

/**
 * Разовое ТЗ из подвала прайса. Не подставлять цену месячного пакета.
 * @param {object|null|undefined} tzDoc
 * @returns {number|null}
 */
export function resolveTzOneTimePriceRub(tzDoc) {
  const doc = normalizeTzPriceListDocument(tzDoc)
  return positiveRub(doc.extras?.one_time)
}

/**
 * @param {object|null|undefined} tzDoc
 * @param {number} months
 * @returns {number|null}
 */
export function resolveTzPackagePriceRub(tzDoc, months) {
  const want = Math.trunc(Number(months) || 0)
  if (!(want > 0)) return null
  const doc = normalizeTzPriceListDocument(tzDoc)

  const pickFromRow = (row) => {
    if (!row) return null
    return (
      positiveRub(row.promo) ??
      positiveRub(row.base_stand) ??
      positiveRub(row.day_stand) ??
      positiveRub(row.base_full)
    )
  }

  const exactPromo = (doc.promo_rows ?? []).find((r) => Number(r.months) === want)
  const exactPromoRub = pickFromRow(exactPromo)
  if (exactPromoRub != null) return exactPromoRub

  const exactM1 = (doc.month1_rows ?? []).find((r) => Number(r.months) === want)
  const exactM1Rub = pickFromRow(exactM1)
  if (exactM1Rub != null) return exactM1Rub

  /** @type {Array<{ months: number, rub: number }>} */
  const pool = []
  for (const r of [...(doc.promo_rows ?? []), ...(doc.month1_rows ?? [])]) {
    const rub = pickFromRow(r)
    const m = Math.trunc(Number(r.months) || 0)
    if (rub != null && m > 0) pool.push({ months: m, rub })
  }
  if (!pool.length) return null
  pool.sort((a, b) => Math.abs(a.months - want) - Math.abs(b.months - want))
  return pool[0].rub
}

/**
 * @param {object|null|undefined} azDoc
 * @param {{ sessions?: unknown, directionId?: unknown }} p
 * @returns {number|null}
 */
export function resolveAzPackagePriceRub(azDoc, p) {
  const directionId = String(p?.directionId ?? '').trim()
  if (!directionId) return null
  const wantSessions = Math.trunc(Number(p?.sessions) || 0)
  const doc = normalizeAzPriceListDocument(azDoc)

  if (wantSessions > 0) {
    const exact = resolvePackagePriceRub(getAzPriceListCell(doc, { sessions: wantSessions, directionId }))
    if (exact != null) return exact
  }

  /** @type {Array<{ sessions: number, rub: number }>} */
  const pool = []
  const cells = doc.cells && typeof doc.cells === 'object' ? doc.cells : {}
  for (const [key, cell] of Object.entries(cells)) {
    const [sRaw, dir] = String(key).split(':')
    if (String(dir ?? '').trim() !== directionId) continue
    const sessions = Math.trunc(Number(sRaw) || 0)
    const rub = resolvePackagePriceRub(cell)
    if (rub != null && sessions > 0) pool.push({ sessions, rub })
  }
  if (!pool.length) return null
  if (wantSessions > 0) {
    pool.sort((a, b) => Math.abs(a.sessions - wantSessions) - Math.abs(b.sessions - wantSessions))
  } else {
    pool.sort((a, b) => a.sessions - b.sessions)
  }
  return pool[wantSessions > 0 ? 0 : Math.floor(pool.length / 2)].rub
}

/**
 * Медиана стендовых цен пакета 8 тр. / 1 чел. по всем типам в прайсе ПЗ.
 * @param {object|null|undefined} pzDoc
 */
export function resolvePzCatalogMedianPriceRub(pzDoc) {
  if (!pzDoc?.cells || typeof pzDoc.cells !== 'object') return null
  const prices = []
  const prefix = `${PZ_DK_SUGGEST_MODE}:${PZ_DK_SUGGEST_SESSIONS}:${PZ_DK_SUGGEST_PEOPLE}:`
  for (const [key, cell] of Object.entries(pzDoc.cells)) {
    if (!String(key).startsWith(prefix)) continue
    const rub = resolvePackagePriceRub(cell)
    if (rub != null) prices.push(rub)
  }
  return medianPositiveRub(prices)
}

/**
 * @param {object|null|undefined} pzDoc
 * @param {string} membershipTypeId
 * @returns {number|null}
 */
export function resolvePzPackagePriceRub(pzDoc, membershipTypeId) {
  const typeId = String(membershipTypeId ?? '').trim()
  if (typeId && pzDoc) {
    const cell = getPriceListCell(pzDoc, {
      sessions: PZ_DK_SUGGEST_SESSIONS,
      people: PZ_DK_SUGGEST_PEOPLE,
      membershipTypeId: typeId,
      mode: PZ_DK_SUGGEST_MODE,
    })
    const exact = resolvePackagePriceRub(cell)
    if (exact != null) return exact
  }
  return resolvePzCatalogMedianPriceRub(pzDoc)
}

/**
 * Прайс по абону, который кончается (без истории покупок).
 * @param {{
 *   hall: 'pz'|'tz'|'az',
 *   membership: object,
 *   pzPriceListDoc?: object|null,
 *   tzPriceListDoc?: object|null,
 *   azPriceListDoc?: object|null,
 * }} input
 * @returns {number|null}
 */
export function resolvePriceListCheckRub(input) {
  const hall = input?.hall
  const m = input?.membership
  if (!hall || !m) return null

  if (hall === 'pz') {
    return resolvePzPackagePriceRub(input.pzPriceListDoc, m.membership_type_id)
  }

  if (hall === 'tz') {
    const duration = inferDeskPackageDuration(m.start_date, m.end_date)
    if (duration?.unit === 'days') {
      if (duration.count === 1) return resolveTzOneTimePriceRub(input.tzPriceListDoc)
      return null
    }
    const months =
      duration?.unit === 'months'
        ? duration.count
        : Math.trunc(Number(m.package_months) || 0) || 1
    return resolveTzPackagePriceRub(input.tzPriceListDoc, months)
  }

  if (hall === 'az') {
    const sessions = Math.trunc(Number(m.total_trainings) || 0)
    const directionId = String(m.membership_type_id ?? '').trim()
    if (!directionId) return null
    return resolveAzPackagePriceRub(input.azPriceListDoc, { sessions, directionId })
  }

  return null
}
