/**
 * Раскладка печати/PNG прайса: отдельные листы A4 альбом.
 * Стратегия: сначала обычные карты, затем VIP; на лист — до 4 колонок тарифов.
 */

/** A4 landscape при ~220 dpi — крупнее цифры на PNG без мыла. */
export const PRICE_LIST_A4_LANDSCAPE = Object.freeze({
  widthPx: 2570,
  heightPx: 1818,
  /** Соотношение сторон листа (297/210). */
  aspect: 297 / 210,
})

/** Сколько колонок тарифов на одном листе (читаемо на A4 альбом). */
export const PRICE_LIST_PRINT_COLS_PER_SHEET = 4

/**
 * @param {unknown} t
 */
export function isPriceListVipTariff(t) {
  return t?.is_vip === true
}

/**
 * @template T
 * @param {T[]} tariffs
 * @returns {{ cards: T[], vip: T[] }}
 */
export function partitionPriceListTariffsByVip(tariffs) {
  const list = Array.isArray(tariffs) ? tariffs : []
  /** @type {T[]} */
  const cards = []
  /** @type {T[]} */
  const vip = []
  for (const t of list) {
    if (isPriceListVipTariff(t)) vip.push(t)
    else cards.push(t)
  }
  return { cards, vip }
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} [size]
 * @returns {T[][]}
 */
export function chunkPriceListTariffs(items, size = PRICE_LIST_PRINT_COLS_PER_SHEET) {
  const list = Array.isArray(items) ? items : []
  const n = Math.max(1, Number(size) || PRICE_LIST_PRINT_COLS_PER_SHEET)
  if (!list.length) return []
  /** @type {T[][]} */
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/**
 * Листы печати: Карты → VIP, каждый кусок ≤ maxCols.
 * @param {unknown[]} tariffs
 * @param {{ maxCols?: number }} [opts]
 * @returns {Array<{ id: string, kind: 'cards'|'vip', groupLabel: string, sheetLabel: string, slug: string, tariffs: object[] }>}
 */
export function buildPriceListPrintSheets(tariffs, opts = {}) {
  const maxCols = Math.max(1, Number(opts.maxCols) || PRICE_LIST_PRINT_COLS_PER_SHEET)
  const { cards, vip } = partitionPriceListTariffsByVip(tariffs)
  /** @type {Array<{ id: string, kind: 'cards'|'vip', groupLabel: string, sheetLabel: string, slug: string, tariffs: object[] }>} */
  const sheets = []

  /**
   * @param {'cards'|'vip'} kind
   * @param {string} groupLabel
   * @param {object[]} items
   */
  const pushGroup = (kind, groupLabel, items) => {
    if (!items.length) return
    const chunks = chunkPriceListTariffs(items, maxCols)
    chunks.forEach((chunk, i) => {
      const part = chunks.length > 1 ? i + 1 : 0
      const slug = part ? `${kind}-${part}` : kind
      sheets.push({
        id: slug,
        kind,
        groupLabel,
        sheetLabel: part ? `${groupLabel} · ${part}` : groupLabel,
        slug,
        tariffs: chunk,
      })
    })
  }

  pushGroup('cards', 'Карты', cards)
  pushGroup('vip', 'VIP', vip)
  return sheets
}

/**
 * Размер шрифта таблицы под число колонок и строк (pt для HTML).
 * Один лист = одна таблица → panels всегда 1.
 * @param {{ tariffCount: number, rowCount: number }} p
 */
export function priceListPrintFontPt({ tariffCount, rowCount }) {
  const cols = 2 + Math.max(1, tariffCount) * 2
  const density = cols * Math.max(1, rowCount)
  if (density > 90) return 10
  if (density > 60) return 11.5
  if (density > 36) return 13
  if (density > 20) return 14.5
  return 16
}

/** @deprecated используйте buildPriceListPrintSheets */
export function shouldSplitPriceListTariffs(tariffs, threshold = PRICE_LIST_PRINT_COLS_PER_SHEET) {
  return buildPriceListPrintSheets(tariffs, { maxCols: threshold }).length > 1
}

/** @deprecated используйте buildPriceListPrintSheets */
export function splitPriceListTariffPanels(tariffs) {
  return buildPriceListPrintSheets(tariffs).map((s) => s.tariffs)
}
