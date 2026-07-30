/**
 * Прайс ПЗ клуба — чистая модель (без React/IDB).
 * Колонки привязаны к membership_types (код PL / VIP — эталон), не к именам Excel.
 */

export const PRICE_LIST_MODES = Object.freeze(['base', 'day'])

export const DEFAULT_SESSIONS = Object.freeze([4, 8, 10])
/** По умолчанию как в Excel ПЗ; админ может оставить только 1 или расширить до 5. */
export const DEFAULT_PEOPLE = Object.freeze([1, 2, 3, 4])
export const PRICE_LIST_PEOPLE_OPTIONS = Object.freeze([1, 2, 3, 4, 5])

/** Скидка витрины «−10%» от полной (базовой) цены. */
export const PRICE_LIST_DISCOUNT_RATE = 0.1

/**
 * Тип подходит в каталог колонок прайса: активный ПЗ, не пробный БЗ.
 * @param {object | null | undefined} t
 */
export function isPriceListCatalogType(t) {
  if (!t || t.is_active === false) return false
  if (t.trainer_assignable === false) return false
  if (t.is_pnk_trial === true) return false
  const code = normalizeMatchKey(t.code)
  if (!code) return false
  if (code === 'бз' || code === 'bz') return false
  return Boolean(String(t.id ?? '').trim())
}

/** @param {object[]} [types] */
export function filterPriceListCatalogTypes(types) {
  return (types ?? []).filter(isPriceListCatalogType)
}

/**
 * Подписи Excel / маркетинга → нормализованный ключ для сопоставления с code типа.
 * Эталон в приложении — code типа (PL, VIP…); это только мост при импорте.
 */
export const EXCEL_LABEL_ALIASES = Object.freeze({
  брилиант: ['bril', 'brilliant', 'бриллиант', 'брилиант'],
  бриллиант: ['bril', 'brilliant', 'бриллиант', 'брилиант'],
  даймонд: ['diamond', 'даймонд', 'диамант'],
  элит: ['elite', 'элит', 'элитa'],
  платинум: ['platinum', 'платинум', 'pl'],
  голд: ['gold', 'голд'],
  '5 звезд': ['5*', '5 звезд', '5зв', 'five'],
  '4 звезды': ['4*', '4 звезды', '4зв'],
  '3 звезды': ['3*', '3 звезды', '3зв'],
  вип: ['vip', 'вип', 'vip1'],
  вип2: ['vip2', 'вип2'],
  вип3: ['vip3', 'вип3'],
})

/** @param {unknown} value */
export function normalizePriceListMode(value) {
  const m = String(value ?? '').trim().toLowerCase()
  return m === 'day' || m === 'day_discount' ? 'day' : 'base'
}

/** @param {unknown} n */
export function roundMoneyRub(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  return Math.round(x)
}

/**
 * Полная → цена со скидкой 10% (то, что часто на стенде).
 * @param {unknown} full
 */
export function priceWithDiscount10(full) {
  const f = Number(full)
  if (!Number.isFinite(f) || f < 0) return null
  return roundMoneyRub(f * (1 - PRICE_LIST_DISCOUNT_RATE))
}

/**
 * Цена со скидкой → полная (обратный расчёт).
 * @param {unknown} discounted
 */
export function priceFullFromDiscount10(discounted) {
  const d = Number(discounted)
  if (!Number.isFinite(d) || d < 0) return null
  return roundMoneyRub(d / (1 - PRICE_LIST_DISCOUNT_RATE))
}

/** @param {string} raw */
export function normalizeMatchKey(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/["«»]/g, '')
    .replace(/карта\s*/g, '')
    .replace(/\s*-\s*10%\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Найти тип абонемента клуба по подписи Excel / маркетинга.
 * Эталон — types[].code; совпадение по code, затем по алиасам.
 *
 * @param {string} excelLabel
 * @param {Array<{ id?: string, code?: string }>} types
 * @returns {{ id: string, code: string } | null}
 */
export function matchMembershipTypeByExcelLabel(excelLabel, types) {
  const key = normalizeMatchKey(excelLabel)
  if (!key || !Array.isArray(types) || !types.length) return null

  const list = types
    .map((t) => ({
      id: String(t?.id ?? '').trim(),
      code: String(t?.code ?? '').trim(),
    }))
    .filter((t) => t.id && t.code)

  const byCode = list.find((t) => normalizeMatchKey(t.code) === key)
  if (byCode) return byCode

  const codeLower = (c) => normalizeMatchKey(c)
  for (const t of list) {
    const c = codeLower(t.code)
    if (c && (key === c || key.includes(c) || c.includes(key))) return t
  }

  for (const [, aliases] of Object.entries(EXCEL_LABEL_ALIASES)) {
    const hit = aliases.some((a) => key === a || key.includes(a))
    if (!hit) continue
    for (const t of list) {
      const c = codeLower(t.code)
      if (aliases.some((a) => c === a || c.includes(a) || a.includes(c))) return t
    }
  }

  return null
}

/**
 * Ключ ячейки матрицы.
 * @param {{ sessions: number, people: number, membershipTypeId: string, mode?: string }} p
 */
export function cellKey({ sessions, people, membershipTypeId, mode = 'base' }) {
  const m = normalizePriceListMode(mode)
  return `${m}:${Number(sessions)}:${Number(people)}:${String(membershipTypeId)}`
}

/**
 * @param {object} [input]
 * @returns {object}
 */
export function emptyPriceListDocument(input = {}) {
  return {
    club_id: String(input.club_id ?? '').trim(),
    valid_from: String(input.valid_from ?? '').trim() || null,
    meta: {
      address: String(input.meta?.address ?? '').trim(),
      phone: String(input.meta?.phone ?? '').trim(),
      title: String(input.meta?.title ?? 'Персональный зал').trim() || 'Персональный зал',
    },
    sessions: [...DEFAULT_SESSIONS],
    people: [...DEFAULT_PEOPLE],
    /** @type {Array<{ membership_type_id: string, code: string, print_label: string, sort_order: number, is_vip: boolean }>} */
    tariffs: [],
    /** @type {Record<string, { price_full: number | null, price_10: number | null }>} */
    cells: {},
    extras: {
      club_card: roundMoneyRub(input.extras?.club_card) ?? 500,
      one_time: {
        base: roundMoneyRub(input.extras?.one_time?.base) ?? null,
        day: roundMoneyRub(input.extras?.one_time?.day) ?? null,
      },
    },
    updated_at: input.updated_at ?? null,
  }
}

/**
 * Собрать колонки прайса из активных ПЗ-типов клуба (эталон code).
 * VIP-подобные коды помечаются is_vip для акцента в UI.
 *
 * @param {object} doc
 * @param {Array<{ id?: string, code?: string, is_active?: boolean, trainer_assignable?: boolean }>} membershipTypes
 * @param {{ replace?: boolean }} [opts]
 */
export function syncTariffsFromMembershipTypes(doc, membershipTypes, opts = {}) {
  const replace = opts.replace === true
  const base = doc && typeof doc === 'object' ? doc : emptyPriceListDocument()
  const catalog = filterPriceListCatalogTypes(membershipTypes)

  const existingById = new Map((base.tariffs ?? []).map((t) => [String(t.membership_type_id), t]))
  const nextTariffs = []

  catalog.forEach((t, index) => {
    const id = String(t.id).trim()
    const code = String(t.code ?? '').trim()
    const prev = existingById.get(id)
    if (!replace && prev) {
      nextTariffs.push({
        ...prev,
        code,
        sort_order: index,
      })
      return
    }
    const codeKey = normalizeMatchKey(code)
    const isVip = codeKey.startsWith('vip') || codeKey.startsWith('вип')
    nextTariffs.push({
      membership_type_id: id,
      code,
      print_label: prev?.print_label || code,
      sort_order: index,
      is_vip: Boolean(prev?.is_vip) || isVip,
    })
  })

  // БЗ и прочие не-каталожные колонки не сохраняем — только актуальный каталог ПЗ.
  return {
    ...base,
    tariffs: nextTariffs,
  }
}

/**
 * Включить / выключить число людей в сетке (1…5). Хотя бы одно значение остаётся.
 * @param {object} doc
 * @param {number} peopleCount
 */
export function togglePriceListPeople(doc, peopleCount) {
  const base = doc && typeof doc === 'object' ? doc : emptyPriceListDocument()
  const n = Number(peopleCount)
  if (!PRICE_LIST_PEOPLE_OPTIONS.includes(n)) return base
  const current = Array.isArray(base.people) && base.people.length ? [...base.people] : [...DEFAULT_PEOPLE]
  const has = current.includes(n)
  let next = has ? current.filter((x) => x !== n) : [...current, n].sort((a, b) => a - b)
  if (!next.length) next = [1]
  return { ...base, people: next }
}

/**
 * Убрать колонку тарифа с прайса (тип в абонементах не трогаем).
 * @param {object} doc
 * @param {string} membershipTypeId
 */
export function removePriceListTariff(doc, membershipTypeId) {
  const base = doc && typeof doc === 'object' ? doc : emptyPriceListDocument()
  const id = String(membershipTypeId ?? '').trim()
  return {
    ...base,
    tariffs: (base.tariffs ?? []).filter((t) => String(t.membership_type_id) !== id),
  }
}

/**
 * @param {object} doc
 * @param {{ sessions: number, people: number, membershipTypeId: string, mode?: string, price_10?: unknown, price_full?: unknown }} patch
 */
export function setPriceListCell(doc, patch) {
  const base = doc && typeof doc === 'object' ? { ...doc, cells: { ...(doc.cells ?? {}) } } : emptyPriceListDocument()
  const key = cellKey({
    sessions: patch.sessions,
    people: patch.people,
    membershipTypeId: patch.membershipTypeId,
    mode: patch.mode,
  })
  const prev = base.cells[key] ?? { price_full: null, price_10: null }
  const link = patch.linkDiscount !== false

  let price_10 = patch.price_10 !== undefined ? roundMoneyRub(patch.price_10) : undefined
  let price_full = patch.price_full !== undefined ? roundMoneyRub(patch.price_full) : undefined

  // Как в Excel: есть базовая и есть −10%. При правке одной — вторая пересчитывается (если link).
  if (link) {
    if (price_10 != null && price_full === undefined) price_full = priceFullFromDiscount10(price_10)
    if (price_full != null && price_10 === undefined) price_10 = priceWithDiscount10(price_full)
  }

  const nextFull = price_full !== undefined ? price_full : prev.price_full
  const next10 = price_10 !== undefined ? price_10 : prev.price_10

  if (nextFull == null && next10 == null) {
    const next = { ...base.cells }
    delete next[key]
    return { ...base, cells: next }
  }

  return {
    ...base,
    cells: {
      ...base.cells,
      [key]: { price_full: nextFull ?? null, price_10: next10 ?? null },
    },
  }
}

/**
 * @param {object} doc
 * @param {{ sessions: number, people: number, membershipTypeId: string, mode?: string }} p
 */
export function getPriceListCell(doc, p) {
  const key = cellKey(p)
  const cell = doc?.cells?.[key]
  if (!cell) return { price_full: null, price_10: null }
  return {
    price_full: cell.price_full ?? null,
    price_10: cell.price_10 ?? null,
  }
}

/**
 * Строки матрицы: sessions × people (как в Excel: блок на N тренировок).
 * @param {object} doc
 * @returns {Array<{ sessions: number, people: number }>}
 */
export function buildPriceListRows(doc) {
  const sessions = Array.isArray(doc?.sessions) && doc.sessions.length ? doc.sessions : DEFAULT_SESSIONS
  const people = Array.isArray(doc?.people) && doc.people.length ? doc.people : DEFAULT_PEOPLE
  const rows = []
  for (const s of sessions) {
    for (const p of people) {
      rows.push({ sessions: Number(s), people: Number(p) })
    }
  }
  return rows
}

/**
 * Нормализация документа после load/save.
 * @param {unknown} raw
 * @param {string} clubId
 */
export function normalizePriceListDocument(raw, clubId) {
  const base = emptyPriceListDocument({ club_id: clubId })
  if (!raw || typeof raw !== 'object') return base

  const src = /** @type {Record<string, unknown>} */ (raw)
  const cellsIn = src.cells && typeof src.cells === 'object' ? /** @type {Record<string, unknown>} */ (src.cells) : {}
  const cells = {}
  for (const [k, v] of Object.entries(cellsIn)) {
    if (!v || typeof v !== 'object') continue
    const row = /** @type {Record<string, unknown>} */ (v)
    cells[k] = {
      price_full: roundMoneyRub(row.price_full),
      price_10: roundMoneyRub(row.price_10),
    }
  }

  const tariffs = Array.isArray(src.tariffs)
    ? src.tariffs
        .map((t, i) => {
          if (!t || typeof t !== 'object') return null
          const row = /** @type {Record<string, unknown>} */ (t)
          const id = String(row.membership_type_id ?? '').trim()
          const code = String(row.code ?? '').trim()
          if (!id || !code) return null
          return {
            membership_type_id: id,
            code,
            print_label: String(row.print_label ?? code).trim() || code,
            sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : i,
            is_vip: row.is_vip === true,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.sort_order - b.sort_order)
    : []

  const extrasIn = src.extras && typeof src.extras === 'object' ? /** @type {Record<string, unknown>} */ (src.extras) : {}
  const oneTime =
    extrasIn.one_time && typeof extrasIn.one_time === 'object'
      ? /** @type {Record<string, unknown>} */ (extrasIn.one_time)
      : {}

  return {
    club_id: String(clubId || src.club_id || '').trim(),
    valid_from: src.valid_from ? String(src.valid_from).trim() : null,
    meta: {
      address: String(/** @type {Record<string, unknown>} */ (src.meta ?? {}).address ?? base.meta.address).trim(),
      phone: String(/** @type {Record<string, unknown>} */ (src.meta ?? {}).phone ?? base.meta.phone).trim(),
      title:
        String(/** @type {Record<string, unknown>} */ (src.meta ?? {}).title ?? base.meta.title).trim() ||
        base.meta.title,
    },
    sessions: Array.isArray(src.sessions) && src.sessions.length
      ? src.sessions.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [...DEFAULT_SESSIONS],
    people: Array.isArray(src.people) && src.people.length
      ? src.people.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [...DEFAULT_PEOPLE],
    tariffs,
    cells,
    extras: {
      club_card: roundMoneyRub(extrasIn.club_card) ?? base.extras.club_card,
      one_time: {
        base: roundMoneyRub(oneTime.base),
        day: roundMoneyRub(oneTime.day),
      },
    },
    updated_at: src.updated_at ? String(src.updated_at) : null,
  }
}
