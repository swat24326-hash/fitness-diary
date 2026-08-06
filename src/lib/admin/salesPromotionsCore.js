/**
 * Акции продаж: цели в плане месяца + факт шт в дневном отчёте.
 * Не входят в plan_matrix / ур. 3 / темп сегментов.
 */

import {
  SALES_MATRIX_KEYS,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
  SALES_DOP_ROW,
} from './salesReportCore.js'

/** @typedef {{ id: string, name: string, start_date: string, end_date: string, segment_key: string, segment_keys: string[], goal_qty: number, note?: string, price_promo_ref?: string | null }} SalesPromotion */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Сегменты матрицы + доп. (как в дневном отчёте). */
export const SALES_PROMO_SEGMENT_KEYS = [...SALES_MATRIX_KEYS]

/** Направления в акции: ПЗ / ТЗ / АЗ / доп. */
export const SALES_PROMO_HALL_OPTIONS = [...SALES_MATRIX_HALL_ROWS, SALES_DOP_ROW]

/** НК / ДК / УК */
export const SALES_PROMO_COL_OPTIONS = [...SALES_MATRIX_COLS]

/** @param {string} key */
export function isSalesPromoSegmentKey(key) {
  return SALES_PROMO_SEGMENT_KEYS.includes(String(key ?? ''))
}

/** @param {string} segmentKey */
export function salesPromoSegmentLabel(segmentKey) {
  const key = String(segmentKey ?? '')
  if (key.startsWith('dop_')) {
    const col = SALES_MATRIX_COLS.find((c) => c.suffix === key.slice(4))
    return `${SALES_DOP_ROW.label} ${col?.label ?? key.slice(4).toUpperCase()}`
  }
  const [hall, colSuffix] = key.split('_')
  const hallRow = SALES_MATRIX_HALL_ROWS.find((r) => r.key === hall)
  const col = SALES_MATRIX_COLS.find((c) => c.suffix === colSuffix)
  if (hallRow && col) return `${hallRow.label} ${col.label}`
  return key || '—'
}

/**
 * @param {string[]} keys
 * @returns {{ hallKeys: string[], colSuffixes: string[] }}
 */
export function promoAxesFromSegmentKeys(keys) {
  /** @type {string[]} */
  const hallKeys = []
  /** @type {string[]} */
  const colSuffixes = []
  for (const raw of keys ?? []) {
    const key = String(raw ?? '').trim()
    if (!isSalesPromoSegmentKey(key)) continue
    const m = key.match(/^(pz|tz|az|dop)_(nk|dk|uk)$/)
    if (!m) continue
    if (!hallKeys.includes(m[1])) hallKeys.push(m[1])
    if (!colSuffixes.includes(m[2])) colSuffixes.push(m[2])
  }
  return { hallKeys, colSuffixes }
}

/**
 * Декартово произведение направлений × НК/ДК/УК → ключи сегментов.
 * @param {string[]} hallKeys
 * @param {string[]} colSuffixes
 */
export function buildPromoSegmentKeysFromAxes(hallKeys, colSuffixes) {
  /** @type {string[]} */
  const halls = []
  for (const h of hallKeys ?? []) {
    const s = String(h ?? '').trim()
    if (s && !halls.includes(s)) halls.push(s)
  }
  /** @type {string[]} */
  const cols = []
  for (const c of colSuffixes ?? []) {
    const s = String(c ?? '').trim()
    if (s && !cols.includes(s)) cols.push(s)
  }
  if (!halls.length || !cols.length) return []
  /** @type {string[]} */
  const out = []
  for (const h of halls) {
    for (const c of cols) {
      const key = `${h}_${c}`
      if (isSalesPromoSegmentKey(key) && !out.includes(key)) out.push(key)
    }
  }
  return out
}

/** @param {string[] | null | undefined} keys */
export function salesPromoSegmentsLabel(keys) {
  const list = []
  for (const k of keys ?? []) {
    const s = String(k ?? '').trim()
    if (isSalesPromoSegmentKey(s) && !list.includes(s)) list.push(s)
  }
  if (!list.length) return '—'
  if (list.length === 1) return salesPromoSegmentLabel(list[0])
  const axes = promoAxesFromSegmentKeys(list)
  const product = buildPromoSegmentKeysFromAxes(axes.hallKeys, axes.colSuffixes)
  const isFullProduct =
    product.length === list.length && product.every((k) => list.includes(k))
  if (isFullProduct && axes.hallKeys.length && axes.colSuffixes.length) {
    const halls = axes.hallKeys
      .map((h) => SALES_PROMO_HALL_OPTIONS.find((o) => o.key === h)?.label ?? h)
      .join('+')
    const cols = axes.colSuffixes
      .map((c) => SALES_PROMO_COL_OPTIONS.find((o) => o.suffix === c)?.label ?? c.toUpperCase())
      .join('+')
    return `${halls} · ${cols}`
  }
  return list.map((k) => salesPromoSegmentLabel(k)).join(', ')
}

/** @param {unknown} item */
export function resolvePromoSegmentKeysFromDraft(item) {
  if (!item || typeof item !== 'object') return []
  const raw = /** @type {{ segment_keys?: unknown, segment_key?: unknown }} */ (item)
  if (Array.isArray(raw.segment_keys) && raw.segment_keys.length) {
    /** @type {string[]} */
    const uniq = []
    for (const k of raw.segment_keys) {
      const s = String(k ?? '').trim()
      if (isSalesPromoSegmentKey(s) && !uniq.includes(s)) uniq.push(s)
    }
    if (uniq.length) return uniq
  }
  const one = String(raw.segment_key ?? '').trim()
  return isSalesPromoSegmentKey(one) ? [one] : []
}

/** @param {unknown} raw */
export function normalizePromotionsFromDb(raw) {
  if (raw == null) return []
  if (!Array.isArray(raw)) return []
  /** @type {SalesPromotion[]} */
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id ?? '').trim()
    const name = String(item.name ?? '').trim()
    const start_date = String(item.start_date ?? '').trim()
    const end_date = String(item.end_date ?? '').trim()
    const segment_keys = resolvePromoSegmentKeysFromDraft(item)
    const goal_qty = Math.max(0, Math.trunc(Number(item.goal_qty) || 0))
    if (!id || !name || !ISO_DATE_RE.test(start_date) || !ISO_DATE_RE.test(end_date)) continue
    if (!segment_keys.length) continue
    if (end_date < start_date) continue
    /** @type {SalesPromotion} */
    const row = {
      id,
      name,
      start_date,
      end_date,
      segment_key: segment_keys[0],
      segment_keys,
      goal_qty,
    }
    const note = String(item.note ?? '').trim()
    if (note) row.note = note
    if (item.price_promo_ref != null && String(item.price_promo_ref).trim()) {
      row.price_promo_ref = String(item.price_promo_ref).trim()
    }
    out.push(row)
  }
  return out
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function normalizePromoSalesFromDb(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  /** @type {Record<string, number>} */
  const out = {}
  for (const [id, val] of Object.entries(raw)) {
    const key = String(id ?? '').trim()
    if (!key) continue
    const n = Math.trunc(Number(val) || 0)
    if (n > 0) out[key] = n
  }
  return out
}

/**
 * Форма дня: строки → payload (нули опускаем).
 * @param {Record<string, string> | Record<string, number> | null | undefined} formMap
 */
export function promoSalesFormToPayload(formMap) {
  /** @type {Record<string, number>} */
  const out = {}
  if (!formMap || typeof formMap !== 'object') return { ok: true, promo_sales: out }
  for (const [id, val] of Object.entries(formMap)) {
    const key = String(id ?? '').trim()
    if (!key) continue
    const raw = String(val ?? '').trim()
    if (raw === '') continue
    const n = Math.trunc(Number(raw))
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: 'Акции: целые числа ≥ 0' }
    }
    if (n > 0) out[key] = n
  }
  return { ok: true, promo_sales: out }
}

/**
 * @param {Record<string, number> | null | undefined} promoSales
 * @returns {Record<string, string>}
 */
export function promoSalesToFormMap(promoSales) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [id, n] of Object.entries(promoSales ?? {})) {
    out[id] = String(Math.trunc(Number(n) || 0))
  }
  return out
}

/** @param {unknown} list */
export function validatePromotionsForSave(list) {
  if (!Array.isArray(list)) {
    return { ok: false, error: 'Акции: ожидается список' }
  }
  const normalized = normalizePromotionsFromDb(list)
  if (list.length !== normalized.length) {
    return {
      ok: false,
      error: 'Акции: проверьте название, даты (ГГГГ-ММ-ДД), направления / НК·ДК·УК и цель ≥ 0',
    }
  }
  const ids = new Set()
  for (const p of normalized) {
    if (ids.has(p.id)) return { ok: false, error: 'Акции: дублируется id' }
    ids.add(p.id)
  }
  return { ok: true, promotions: normalized }
}

/**
 * @param {SalesPromotion[] | null | undefined} promos
 * @param {string} isoDate
 */
export function activePromotionsOnDate(promos, isoDate) {
  const day = String(isoDate ?? '').trim()
  if (!ISO_DATE_RE.test(day)) return []
  return normalizePromotionsFromDb(promos).filter((p) => p.start_date <= day && day <= p.end_date)
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} monthRows
 * @param {string} promoId
 */
export function sumPromoFact(monthRows, promoId) {
  const id = String(promoId ?? '').trim()
  if (!id) return 0
  let total = 0
  for (const row of monthRows ?? []) {
    const map = normalizePromoSalesFromDb(row?.promo_sales)
    total += Math.trunc(Number(map[id]) || 0)
  }
  return total
}

/**
 * Есть ли ненулевые штуки по акциям (иначе валидацию не гоняем — legacy save).
 * @param {Record<string, number> | null | undefined} promoSales
 */
export function hasNonZeroPromoSales(promoSales) {
  for (const n of Object.values(promoSales ?? {})) {
    if (Math.trunc(Number(n) || 0) > 0) return true
  }
  return false
}

/**
 * Односегментные акции: Σ шт по S ≤ ячейка S.
 * Несколько сегментов у одной акции: шт акции ≤ сумма ячеек выбранных сегментов (общая цель).
 * @param {{
 *   promo_sales?: Record<string, number> | null,
 *   promotions?: SalesPromotion[] | null,
 *   matrixCounts?: Record<string, number> | null,
 * }} args
 */
export function validateDayPromoSales(args) {
  const promoSales = normalizePromoSalesFromDb(args?.promo_sales)
  if (!hasNonZeroPromoSales(promoSales)) return { ok: true }

  const promotions = normalizePromotionsFromDb(args?.promotions)
  const byId = new Map(promotions.map((p) => [p.id, p]))
  /** @type {Record<string, number>} */
  const bySegment = {}
  const matrix = args?.matrixCounts ?? {}

  for (const [promoId, qty] of Object.entries(promoSales)) {
    const n = Math.trunc(Number(qty) || 0)
    if (n <= 0) continue
    const promo = byId.get(promoId)
    if (!promo) {
      return { ok: false, error: `Акция не найдена в плане месяца (${promoId.slice(0, 8)}…)` }
    }
    const keys = promo.segment_keys?.length ? promo.segment_keys : [promo.segment_key]
    if (keys.length <= 1) {
      const sk = keys[0] || promo.segment_key
      bySegment[sk] = (bySegment[sk] || 0) + n
      continue
    }
    let pool = 0
    for (const sk of keys) {
      pool += Math.trunc(Number(matrix[sk]) || 0)
    }
    if (n > pool) {
      const label = salesPromoSegmentsLabel(keys)
      return {
        ok: false,
        error: `По акции «${promo.name}» (${label}) указано ${n} шт., в матрице по выбранным сегментам — ${pool}. Уменьшите акции или увеличьте факт.`,
      }
    }
  }

  for (const [segmentKey, promoQty] of Object.entries(bySegment)) {
    const cell = Math.trunc(Number(matrix[segmentKey]) || 0)
    if (promoQty > cell) {
      const label = salesPromoSegmentLabel(segmentKey)
      return {
        ok: false,
        error: `По акциям «${label}» указано ${promoQty} шт., в матрице дня — ${cell}. Уменьшите акции или увеличьте факт сегмента.`,
      }
    }
  }
  return { ok: true }
}

/**
 * @param {{
 *   promotions?: unknown,
 *   monthRows?: Array<Record<string, unknown>> | null,
 *   todayIso?: string | null,
 * }} args
 */
export function buildPromotionsComparison(args) {
  const promotions = normalizePromotionsFromDb(args?.promotions)
  if (!promotions.length) {
    return { has_promotions: false, rows: [] }
  }
  const today = String(args?.todayIso ?? '').trim()
  const rows = promotions.map((p) => {
    const sold = sumPromoFact(args?.monthRows, p.id)
    const goal = p.goal_qty
    const remaining = Math.max(0, goal - sold)
    const pct = goal > 0 ? Math.round((sold / goal) * 1000) / 10 : null
    const activeNow =
      ISO_DATE_RE.test(today) && p.start_date <= today && today <= p.end_date
    return {
      id: p.id,
      name: p.name,
      segment_key: p.segment_key,
      segment_keys: p.segment_keys,
      segment_label: salesPromoSegmentsLabel(p.segment_keys),
      start_date: p.start_date,
      end_date: p.end_date,
      goal_qty: goal,
      sold_qty: sold,
      remaining_qty: remaining,
      pct_of_goal: pct,
      active_now: activeNow,
    }
  })
  return { has_promotions: true, rows }
}

/** Новый id акции (клиент). */
export function createSalesPromotionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Черновик пустой акции на месяц.
 * @param {{ year: number, month: number }} ym
 */
export function emptySalesPromotionDraft(ym) {
  const y = Number(ym?.year)
  const m = Number(ym?.month)
  const start = Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
    ? `${y}-${String(m).padStart(2, '0')}-01`
    : ''
  const lastDay =
    Number.isFinite(y) && Number.isFinite(m) ? new Date(y, m, 0).getDate() : 28
  const end = start
    ? `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    : ''
  return {
    id: createSalesPromotionId(),
    name: '',
    start_date: start,
    end_date: end,
    segment_key: 'pz_nk',
    segment_keys: ['pz_nk'],
    goal_qty: 0,
    note: '',
  }
}
