/**
 * Прайс аэробного зала (АЗ) — чистая модель.
 * Эталон: scripts/fixtures/az-price-1kfs.xlsx (листы «АЗ», «Лист1», «Доплаты»).
 */

import { priceFullFromDiscount10, priceWithDiscount10, roundMoneyRub } from './priceListCore.js'

/** @typedef {'result' | 'classes' | 'fees'} AzPriceListView */

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseAzMoney(raw) {
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
 * @returns {number | null}
 */
export function parseAzSessions(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.trunc(raw)
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  const m = s.match(/(\d+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * Стабильный id направления из подписи Excel.
 * @param {unknown} label
 * @param {string} [fallback]
 */
export function slugAzDirection(label, fallback = 'dir') {
  const s = String(label ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\r|\n/g, ' ')
    .replace(/ск\s*10\s*%/gi, '')
    .replace(/[^a-zа-я0-9+]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!s) return fallback
  const map = {
    'результат1+': 'r1plus',
    'результат2+': 'r2plus',
    'результат3+': 'r3plus',
    результат: 'result',
    йога: 'yoga',
    бокс: 'box',
    степ: 'step',
  }
  if (map[s]) return map[s]
  return s.slice(0, 32)
}

/**
 * @param {number} sessions
 * @param {string} directionId
 */
export function azPriceListCellKey(sessions, directionId) {
  return `${Math.trunc(Number(sessions) || 0)}:${String(directionId ?? '').trim()}`
}

/**
 * @param {object} doc
 * @param {{ sessions: number, directionId: string }} p
 */
export function getAzPriceListCell(doc, p) {
  const key = azPriceListCellKey(p.sessions, p.directionId)
  const cells = doc?.cells && typeof doc.cells === 'object' ? doc.cells : {}
  const cell = cells[key]
  if (!cell || typeof cell !== 'object') return { price_full: null, price_10: null }
  return {
    price_full: parseAzMoney(cell.price_full),
    price_10: parseAzMoney(cell.price_10),
  }
}

/**
 * @param {object} doc
 * @param {{
 *   sessions: number,
 *   directionId: string,
 *   price_full?: number | null,
 *   price_10?: number | null,
 *   linkDiscount?: boolean,
 * }} p
 */
export function setAzPriceListCell(doc, p) {
  const n = normalizeAzPriceListDocument(doc)
  const key = azPriceListCellKey(p.sessions, p.directionId)
  const prev = getAzPriceListCell(n, p)
  const link = p.linkDiscount !== false

  let price_full = p.price_full !== undefined ? parseAzMoney(p.price_full) : undefined
  let price_10 = p.price_10 !== undefined ? parseAzMoney(p.price_10) : undefined

  // Как у ПЗ: правка полной ↔ стенд −10% (если link).
  if (link) {
    if (price_10 != null && price_full === undefined) price_full = priceFullFromDiscount10(price_10)
    if (price_full != null && price_10 === undefined) price_10 = priceWithDiscount10(price_full)
  }

  const nextFull = price_full !== undefined ? price_full : prev.price_full
  const next10 = price_10 !== undefined ? price_10 : prev.price_10

  if (nextFull == null && next10 == null) {
    const next = { ...n.cells }
    delete next[key]
    return { ...n, cells: next }
  }

  return {
    ...n,
    cells: {
      ...n.cells,
      [key]: { price_full: nextFull, price_10: next10 },
    },
  }
}

/**
 * @param {object} [input]
 */
export function emptyAzPriceListDocument(input = {}) {
  return {
    club_id: String(input.club_id ?? '').trim(),
    hall: 'az',
    valid_from: String(input.valid_from ?? '').trim() || null,
    meta: {
      title: String(input.meta?.title ?? 'Зал групповых программ').trim() || 'Зал групповых программ',
      address_lines: Array.isArray(input.meta?.address_lines)
        ? input.meta.address_lines.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [],
      phones: Array.isArray(input.meta?.phones)
        ? input.meta.phones.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [],
    },
    result_directions: Array.isArray(input.result_directions) ? input.result_directions : [],
    class_directions: Array.isArray(input.class_directions) ? input.class_directions : [],
    session_counts: Array.isArray(input.session_counts) ? input.session_counts : [],
    cells: input.cells && typeof input.cells === 'object' ? input.cells : {},
    extras: {
      result_plus: parseAzMoney(input.extras?.result_plus),
      one_time_result_plus: parseAzMoney(input.extras?.one_time_result_plus),
      evening_pt_surcharge: parseAzMoney(input.extras?.evening_pt_surcharge),
      other_fees: Array.isArray(input.extras?.other_fees) ? input.extras.other_fees : [],
    },
    updated_at: input.updated_at ?? null,
  }
}

/**
 * @param {object} dir
 * @param {number} idx
 */
export function normalizeAzDirection(dir, idx = 0) {
  const label = String(dir?.label ?? '').replace(/\s+/g, ' ').trim()
  const id = String(dir?.id ?? '').trim() || slugAzDirection(label, `dir-${idx}`)
  return { id, label: label || id }
}

/**
 * @param {object} fee
 * @param {number} idx
 */
export function normalizeAzOtherFee(fee, idx = 0) {
  const name = String(fee?.name ?? '').trim()
  const amount = parseAzMoney(fee?.amount)
  const id = String(fee?.id ?? '').trim() || `fee-${idx}-${slugAzDirection(name, 'x')}`
  return { id, name, amount }
}

/**
 * Дата «с ДД.ММ.ГГГГ» / ISO → ISO date.
 * @param {unknown} raw
 */
export function parseAzValidFrom(raw) {
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

/**
 * @param {unknown} doc
 * @param {string} [clubId]
 */
export function normalizeAzPriceListDocument(doc, clubId = '') {
  const src = doc && typeof doc === 'object' ? /** @type {Record<string, unknown>} */ (doc) : {}
  const metaIn = src.meta && typeof src.meta === 'object' ? /** @type {Record<string, unknown>} */ (src.meta) : {}
  const extrasIn =
    src.extras && typeof src.extras === 'object' ? /** @type {Record<string, unknown>} */ (src.extras) : {}
  const id = String(clubId || src.club_id || '').trim()

  const result_directions = (Array.isArray(src.result_directions) ? src.result_directions : []).map((d, i) =>
    normalizeAzDirection(/** @type {object} */ (d), i),
  )
  const class_directions = (Array.isArray(src.class_directions) ? src.class_directions : []).map((d, i) =>
    normalizeAzDirection(/** @type {object} */ (d), i),
  )

  const session_counts = [
    ...new Set(
      (Array.isArray(src.session_counts) ? src.session_counts : [])
        .map((n) => parseAzSessions(n))
        .filter((n) => n != null),
    ),
  ].sort((a, b) => a - b)

  const cellsIn = src.cells && typeof src.cells === 'object' ? /** @type {Record<string, unknown>} */ (src.cells) : {}
  /** @type {Record<string, { price_full: number | null, price_10: number | null }>} */
  const cells = {}
  for (const [key, val] of Object.entries(cellsIn)) {
    if (!val || typeof val !== 'object') continue
    const cell = /** @type {Record<string, unknown>} */ (val)
    cells[String(key)] = {
      price_full: parseAzMoney(cell.price_full),
      price_10: parseAzMoney(cell.price_10),
    }
  }

  let address_lines = Array.isArray(metaIn.address_lines)
    ? metaIn.address_lines.map((x) => String(x ?? '').trim()).filter(Boolean)
    : []
  if (!address_lines.length && metaIn.address) {
    address_lines = String(metaIn.address)
      .split(/\n|;\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  let phones = Array.isArray(metaIn.phones)
    ? metaIn.phones.map((x) => String(x ?? '').trim()).filter(Boolean)
    : []
  if (!phones.length && metaIn.phone) {
    phones = String(metaIn.phone)
      .split(/;|,/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return emptyAzPriceListDocument({
    club_id: id,
    valid_from: src.valid_from,
    meta: {
      title: metaIn.title,
      address_lines,
      phones,
    },
    result_directions,
    class_directions,
    session_counts,
    cells,
    extras: {
      result_plus: extrasIn.result_plus,
      one_time_result_plus: extrasIn.one_time_result_plus,
      evening_pt_surcharge: extrasIn.evening_pt_surcharge,
      other_fees: (Array.isArray(extrasIn.other_fees) ? extrasIn.other_fees : []).map((f, i) =>
        normalizeAzOtherFee(/** @type {object} */ (f), i),
      ),
    },
    updated_at: src.updated_at ?? null,
  })
}

/**
 * Есть ли хоть одна ячейка / направление.
 * @param {object} doc
 */
export function azPriceListHasGrid(doc) {
  const n = normalizeAzPriceListDocument(doc)
  return (
    (n.result_directions.length > 0 || n.class_directions.length > 0) &&
    n.session_counts.length > 0
  )
}

/** Типовые направления «Результат» (стенд 1КФС). */
export const AZ_DEFAULT_RESULT_DIRECTIONS = [
  { id: 'r1plus', label: 'Результат1+' },
  { id: 'r2plus', label: 'Результат2+' },
  { id: 'r3plus', label: 'Результат3+' },
]

/** Типовые групповые направления. */
export const AZ_DEFAULT_CLASS_DIRECTIONS = [
  { id: 'yoga', label: 'Йога' },
  { id: 'box', label: 'Бокс' },
  { id: 'step', label: 'Степ' },
]

export const AZ_DEFAULT_SESSION_COUNTS = [4, 8, 10]

/**
 * Пустая типовая сетка АЗ — правка без Excel (аналог «Сверить с типами» у ПЗ).
 * @param {object} doc
 * @param {{ replace?: boolean }} [opts]
 */
export function seedAzPriceListDefaults(doc, opts = {}) {
  const n = normalizeAzPriceListDocument(doc)
  const replace = Boolean(opts.replace)
  const result_directions =
    !replace && n.result_directions.length
      ? n.result_directions
      : AZ_DEFAULT_RESULT_DIRECTIONS.map((d, i) => normalizeAzDirection(d, i))
  const class_directions =
    !replace && n.class_directions.length
      ? n.class_directions
      : AZ_DEFAULT_CLASS_DIRECTIONS.map((d, i) => normalizeAzDirection(d, i))
  const session_counts =
    !replace && n.session_counts.length ? n.session_counts : [...AZ_DEFAULT_SESSION_COUNTS]
  const extras = {
    ...n.extras,
    result_plus: n.extras.result_plus ?? 730,
    one_time_result_plus: n.extras.one_time_result_plus ?? 750,
    evening_pt_surcharge: n.extras.evening_pt_surcharge ?? 100,
    other_fees:
      !replace && n.extras.other_fees.length
        ? n.extras.other_fees
        : [
            normalizeAzOtherFee({ name: 'Клубная карта', amount: 500 }, 0),
            normalizeAzOtherFee({ name: 'Ключ', amount: 200 }, 1),
          ],
  }
  return normalizeAzPriceListDocument({
    ...n,
    result_directions,
    class_directions,
    session_counts,
    extras,
  })
}

/**
 * @param {object} doc
 * @param {'result' | 'classes'} kind
 * @param {{ id?: string, label?: string }} [dir]
 */
export function addAzDirection(doc, kind, dir = {}) {
  const n = normalizeAzPriceListDocument(doc)
  const listKey = kind === 'classes' ? 'class_directions' : 'result_directions'
  const list = n[listKey]
  const label = String(dir.label ?? '').trim() || (kind === 'classes' ? 'Новое направление' : 'Результат+')
  const next = normalizeAzDirection(
    { id: dir.id || slugAzDirection(label, `dir-${list.length}`), label },
    list.length,
  )
  if (list.some((d) => d.id === next.id)) {
    next.id = `${next.id}-${list.length + 1}`
  }
  return normalizeAzPriceListDocument({
    ...n,
    [listKey]: [...list, next],
  })
}

/**
 * @param {object} doc
 * @param {'result' | 'classes'} kind
 * @param {string} directionId
 */
export function removeAzDirection(doc, kind, directionId) {
  const n = normalizeAzPriceListDocument(doc)
  const want = String(directionId ?? '').trim()
  const listKey = kind === 'classes' ? 'class_directions' : 'result_directions'
  const cells = { ...n.cells }
  for (const key of Object.keys(cells)) {
    if (key.endsWith(`:${want}`)) delete cells[key]
  }
  return normalizeAzPriceListDocument({
    ...n,
    [listKey]: n[listKey].filter((d) => d.id !== want),
    cells,
  })
}

/**
 * @param {object} doc
 * @param {'result' | 'classes'} kind
 * @param {string} directionId
 * @param {string} label
 */
export function renameAzDirection(doc, kind, directionId, label) {
  const n = normalizeAzPriceListDocument(doc)
  const want = String(directionId ?? '').trim()
  const listKey = kind === 'classes' ? 'class_directions' : 'result_directions'
  return normalizeAzPriceListDocument({
    ...n,
    [listKey]: n[listKey].map((d) => (d.id === want ? { ...d, label: String(label ?? '').trim() || d.label } : d)),
  })
}

/**
 * @param {object} doc
 * @param {number} sessions
 */
export function addAzSessionCount(doc, sessions) {
  const n = normalizeAzPriceListDocument(doc)
  const s = parseAzSessions(sessions)
  if (s == null || n.session_counts.includes(s)) return n
  return normalizeAzPriceListDocument({
    ...n,
    session_counts: [...n.session_counts, s].sort((a, b) => a - b),
  })
}

/**
 * @param {object} doc
 * @param {number} sessions
 */
export function removeAzSessionCount(doc, sessions) {
  const n = normalizeAzPriceListDocument(doc)
  const s = parseAzSessions(sessions)
  if (s == null) return n
  const cells = { ...n.cells }
  for (const key of Object.keys(cells)) {
    if (key.startsWith(`${s}:`)) delete cells[key]
  }
  return normalizeAzPriceListDocument({
    ...n,
    session_counts: n.session_counts.filter((x) => x !== s),
    cells,
  })
}

/**
 * @param {object} doc
 * @param {{ name?: string, amount?: number | null }} [fee]
 */
export function addAzOtherFee(doc, fee = {}) {
  const n = normalizeAzPriceListDocument(doc)
  const next = normalizeAzOtherFee(
    { name: fee.name || 'Доплата', amount: fee.amount ?? null },
    n.extras.other_fees.length,
  )
  return normalizeAzPriceListDocument({
    ...n,
    extras: {
      ...n.extras,
      other_fees: [...n.extras.other_fees, next],
    },
  })
}

/**
 * @param {object} doc
 * @param {string} id
 */
export function removeAzOtherFee(doc, id) {
  const n = normalizeAzPriceListDocument(doc)
  const want = String(id ?? '').trim()
  return normalizeAzPriceListDocument({
    ...n,
    extras: {
      ...n.extras,
      other_fees: n.extras.other_fees.filter((f) => f.id !== want),
    },
  })
}

/**
 * @param {object} doc
 * @param {string} id
 * @param {{ name?: string, amount?: unknown }} patch
 */
export function updateAzOtherFee(doc, id, patch) {
  const n = normalizeAzPriceListDocument(doc)
  const want = String(id ?? '').trim()
  return normalizeAzPriceListDocument({
    ...n,
    extras: {
      ...n.extras,
      other_fees: n.extras.other_fees.map((f, i) =>
        f.id === want
          ? normalizeAzOtherFee(
              {
                ...f,
                name: patch.name !== undefined ? patch.name : f.name,
                amount: patch.amount !== undefined ? patch.amount : f.amount,
              },
              i,
            )
          : f,
      ),
    },
  })
}
