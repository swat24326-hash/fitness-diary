/**
 * Прайс тренажёрного зала (ТЗ) — чистая модель.
 * Эталон: scripts/fixtures/tz-price-1kfs.xls (листы «ТЗ 1мес.» и «ТЗ акции»).
 * Не путать с прайсом ПЗ (карты × люди × тренировки).
 */

import { roundMoneyRub } from './priceListCore.js'

/** @typedef {'month1' | 'promo'} TzPriceListView */

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseTzMoney(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return roundMoneyRub(raw)
  const s = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, '')
    .replace(/₽|руб\.?/gi, '')
    .replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return roundMoneyRub(n)
}

/**
 * @param {unknown} raw
 * @returns {number | null} null = без лимита
 */
export function parseTzSessions(raw) {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  if (/без\s*лимит|безлимит|unlimited/.test(s)) return null
  const m = s.match(/(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseTzMonths(raw) {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  const m = s.match(/(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * @param {number | null | undefined} sessions
 */
export function formatTzSessionsLabel(sessions) {
  if (sessions == null || !(Number(sessions) > 0)) return 'без лимита'
  const n = Math.trunc(Number(sessions))
  return `${n} ${n === 1 ? 'занятие' : n < 5 ? 'занятия' : 'занятий'}`
}

/**
 * @param {number | null | undefined} months
 */
export function formatTzMonthsLabel(months) {
  const n = Math.trunc(Number(months) || 0)
  if (!(n > 0)) return '—'
  if (n === 1) return '1 месяц'
  if (n < 5) return `${n} мес.`
  return `${n} мес.`
}

/**
 * @param {object} [input]
 */
export function emptyTzPriceListDocument(input = {}) {
  return {
    club_id: String(input.club_id ?? '').trim(),
    hall: 'tz',
    valid_from: String(input.valid_from ?? '').trim() || null,
    meta: {
      address: String(input.meta?.address ?? '').trim(),
      phone: String(input.meta?.phone ?? '').trim(),
      title: String(input.meta?.title ?? 'Тренажёрный зал').trim() || 'Тренажёрный зал',
      base_hours_note: String(input.meta?.base_hours_note ?? '').trim(),
      day_hours_note: String(input.meta?.day_hours_note ?? '').trim(),
    },
    /** @type {Array<{ id: string, months: number, sessions: number | null, base_full: number | null, base_stand: number | null, base_save: number | null, day_stand: number | null, day_save: number | null }>} */
    month1_rows: Array.isArray(input.month1_rows) ? input.month1_rows : [],
    /** @type {Array<{ id: string, months: number, sessions: number | null, base_full: number | null, promo: number | null, save: number | null, month_cost: number | null }>} */
    promo_rows: Array.isArray(input.promo_rows) ? input.promo_rows : [],
    extras: {
      one_time: parseTzMoney(input.extras?.one_time) ?? 750,
      club_card: parseTzMoney(input.extras?.club_card) ?? 500,
    },
    updated_at: input.updated_at ?? null,
  }
}

/**
 * @param {object} row
 * @param {number} idx
 */
export function normalizeTzMonth1Row(row, idx = 0) {
  const months = parseTzMonths(row?.months) ?? 1
  const sessions = parseTzSessions(row?.sessions)
  const base_full = parseTzMoney(row?.base_full)
  const base_stand = parseTzMoney(row?.base_stand)
  const day_stand = parseTzMoney(row?.day_stand)
  const base_save =
    parseTzMoney(row?.base_save) ??
    (base_full != null && base_stand != null ? roundMoneyRub(base_full - base_stand) : null)
  const day_save =
    parseTzMoney(row?.day_save) ??
    (base_full != null && day_stand != null ? roundMoneyRub(base_full - day_stand) : null)
  const id = String(row?.id ?? '').trim() || `m1-${months}-${sessions ?? 'ul'}-${idx}`
  return {
    id,
    months,
    sessions,
    base_full,
    base_stand,
    base_save,
    day_stand,
    day_save,
  }
}

/**
 * @param {object} row
 * @param {number} idx
 */
export function normalizeTzPromoRow(row, idx = 0) {
  const months = parseTzMonths(row?.months) ?? 1
  const sessions = parseTzSessions(row?.sessions)
  const base_full = parseTzMoney(row?.base_full)
  const promo = parseTzMoney(row?.promo)
  const save =
    parseTzMoney(row?.save) ??
    (base_full != null && promo != null ? roundMoneyRub(base_full - promo) : null)
  const month_cost =
    parseTzMoney(row?.month_cost) ??
    (promo != null && months > 0 ? roundMoneyRub(promo / months) : null)
  const id = String(row?.id ?? '').trim() || `promo-${months}-${idx}`
  return {
    id,
    months,
    sessions,
    base_full,
    promo,
    save,
    month_cost,
  }
}

/**
 * @param {unknown} doc
 * @param {string} [clubId]
 */
export function normalizeTzPriceListDocument(doc, clubId = '') {
  const src = doc && typeof doc === 'object' ? /** @type {Record<string, unknown>} */ (doc) : {}
  const metaIn = src.meta && typeof src.meta === 'object' ? /** @type {Record<string, unknown>} */ (src.meta) : {}
  const extrasIn =
    src.extras && typeof src.extras === 'object' ? /** @type {Record<string, unknown>} */ (src.extras) : {}
  const id = String(clubId || src.club_id || '').trim()

  const month1_rows = (Array.isArray(src.month1_rows) ? src.month1_rows : []).map((r, i) =>
    normalizeTzMonth1Row(/** @type {object} */ (r), i),
  )
  const promo_rows = (Array.isArray(src.promo_rows) ? src.promo_rows : []).map((r, i) =>
    normalizeTzPromoRow(/** @type {object} */ (r), i),
  )

  return emptyTzPriceListDocument({
    club_id: id,
    valid_from: src.valid_from,
    meta: {
      address: metaIn.address,
      phone: metaIn.phone,
      title: metaIn.title,
      base_hours_note: metaIn.base_hours_note,
      day_hours_note: metaIn.day_hours_note,
    },
    month1_rows,
    promo_rows,
    extras: {
      one_time: extrasIn.one_time,
      club_card: extrasIn.club_card,
    },
    updated_at: src.updated_at ?? null,
  })
}

/**
 * Пересчёт «экономия» и «себестоимость месяца» после правки ячейки.
 * @param {object} doc
 */
export function recomputeTzPriceListDerived(doc) {
  const n = normalizeTzPriceListDocument(doc)
  return {
    ...n,
    month1_rows: n.month1_rows.map((r, i) =>
      normalizeTzMonth1Row(
        {
          ...r,
          base_save: undefined,
          day_save: undefined,
        },
        i,
      ),
    ),
    promo_rows: n.promo_rows.map((r, i) =>
      normalizeTzPromoRow(
        {
          ...r,
          save: undefined,
          month_cost: undefined,
        },
        i,
      ),
    ),
  }
}

/**
 * Дата «с ДД.ММ.ГГГГ» / ISO → ISO date.
 * @param {unknown} raw
 */
export function parseTzValidFrom(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const ru = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (!ru) return null
  let y = Number(ru[3])
  if (y < 100) y += 2000
  const m = String(Number(ru[2])).padStart(2, '0')
  const d = String(Number(ru[1])).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Типовая сетка «1 месяц» (как на стенде 1КФС) — без цен, только структура. */
export const TZ_DEFAULT_MONTH1_SESSIONS = [8, 10, null]

/** Типовые сроки акций (мес). */
export const TZ_DEFAULT_PROMO_MONTHS = [1, 2, 3, 4, 6, 9, 12]

const TZ_DEFAULT_BASE_HOURS = '9:00–22:00 (будни), 9:00–19:00 (вых.)'
const TZ_DEFAULT_DAY_HOURS = '9:00–17:00 (будни и вых.)'

/**
 * Пустая типовая сетка ТЗ (как «Сверить с типами» у ПЗ) — можно править без Excel.
 * @param {object} doc
 * @param {{ replace?: boolean, includePromo?: boolean }} [opts]
 */
export function seedTzPriceListDefaults(doc, opts = {}) {
  const n = normalizeTzPriceListDocument(doc)
  const replace = Boolean(opts.replace)
  const includePromo = opts.includePromo !== false
  const month1_rows =
    !replace && n.month1_rows.length
      ? n.month1_rows
      : TZ_DEFAULT_MONTH1_SESSIONS.map((sessions, i) =>
          normalizeTzMonth1Row({ months: 1, sessions }, i),
        )
  const promo_rows =
    !includePromo
      ? n.promo_rows
      : !replace && n.promo_rows.length
        ? n.promo_rows
        : TZ_DEFAULT_PROMO_MONTHS.map((months, i) =>
            normalizeTzPromoRow({ months, sessions: null }, i),
          )
  return recomputeTzPriceListDerived({
    ...n,
    month1_rows,
    promo_rows,
    meta: {
      ...n.meta,
      base_hours_note: n.meta.base_hours_note || TZ_DEFAULT_BASE_HOURS,
      day_hours_note: n.meta.day_hours_note || TZ_DEFAULT_DAY_HOURS,
    },
  })
}

/**
 * @param {object} doc
 * @param {{ months?: number, sessions?: number | null }} [row]
 */
export function addTzMonth1Row(doc, row = {}) {
  const n = normalizeTzPriceListDocument(doc)
  const next = normalizeTzMonth1Row(
    {
      months: row.months ?? 1,
      sessions: row.sessions === undefined ? 8 : row.sessions,
    },
    n.month1_rows.length,
  )
  return recomputeTzPriceListDerived({
    ...n,
    month1_rows: [...n.month1_rows, next],
  })
}

/**
 * @param {object} doc
 * @param {string} id
 */
export function removeTzMonth1Row(doc, id) {
  const n = normalizeTzPriceListDocument(doc)
  const want = String(id ?? '').trim()
  return recomputeTzPriceListDerived({
    ...n,
    month1_rows: n.month1_rows.filter((r) => r.id !== want),
  })
}

/**
 * @param {object} doc
 * @param {{ months?: number, sessions?: number | null }} [row]
 */
export function addTzPromoRow(doc, row = {}) {
  const n = normalizeTzPriceListDocument(doc)
  const next = normalizeTzPromoRow(
    {
      months: row.months ?? 3,
      sessions: row.sessions === undefined ? null : row.sessions,
    },
    n.promo_rows.length,
  )
  return recomputeTzPriceListDerived({
    ...n,
    promo_rows: [...n.promo_rows, next],
  })
}

/**
 * @param {object} doc
 * @param {string} id
 */
export function removeTzPromoRow(doc, id) {
  const n = normalizeTzPriceListDocument(doc)
  const want = String(id ?? '').trim()
  return recomputeTzPriceListDerived({
    ...n,
    promo_rows: n.promo_rows.filter((r) => r.id !== want),
  })
}

/**
 * Правка оси строки (срок / кол-во занятий).
 * @param {object} doc
 * @param {'month1' | 'promo'} kind
 * @param {string} id
 * @param {{ months?: unknown, sessions?: unknown }} patch
 */
export function updateTzRowAxis(doc, kind, id, patch) {
  const n = normalizeTzPriceListDocument(doc)
  const want = String(id ?? '').trim()
  if (kind === 'promo') {
    return recomputeTzPriceListDerived({
      ...n,
      promo_rows: n.promo_rows.map((r, i) =>
        r.id === want
          ? normalizeTzPromoRow(
              {
                ...r,
                months: patch.months !== undefined ? patch.months : r.months,
                sessions: patch.sessions !== undefined ? patch.sessions : r.sessions,
                save: undefined,
                month_cost: undefined,
              },
              i,
            )
          : r,
      ),
    })
  }
  return recomputeTzPriceListDerived({
    ...n,
    month1_rows: n.month1_rows.map((r, i) =>
      r.id === want
        ? normalizeTzMonth1Row(
            {
              ...r,
              months: patch.months !== undefined ? patch.months : r.months,
              sessions: patch.sessions !== undefined ? patch.sessions : r.sessions,
              base_save: undefined,
              day_save: undefined,
            },
            i,
          )
        : r,
    ),
  })
}
