/**
 * Раскладка печати/PNG прайса под A4 landscape.
 * При многих колонках — две симметричные панели тарифов.
 */

/** A4 landscape при ~150 dpi (мм → px ≈ 150/25.4). */
export const PRICE_LIST_A4_LANDSCAPE = Object.freeze({
  widthPx: 1754,
  heightPx: 1240,
  /** Соотношение сторон листа (297/210). */
  aspect: 297 / 210,
})

/**
 * Две колонки, если тарифов больше порога (иначе одна широкая таблица).
 * @param {unknown[]} tariffs
 * @param {number} [threshold]
 */
export function shouldSplitPriceListTariffs(tariffs, threshold = 4) {
  return (Array.isArray(tariffs) ? tariffs.length : 0) > threshold
}

/**
 * Делит тарифы пополам для двух панелей (левая чуть больше при нечётном числе).
 * @template T
 * @param {T[]} tariffs
 * @returns {T[][]}
 */
export function splitPriceListTariffPanels(tariffs) {
  const list = Array.isArray(tariffs) ? tariffs : []
  if (!list.length) return []
  if (!shouldSplitPriceListTariffs(list)) return [list]
  const mid = Math.ceil(list.length / 2)
  return [list.slice(0, mid), list.slice(mid)]
}

/**
 * Размер шрифта таблицы под число колонок и строк (pt для HTML).
 * @param {{ tariffCount: number, rowCount: number, panels?: number }} p
 */
export function priceListPrintFontPt({ tariffCount, rowCount, panels = 1 }) {
  const cols = 2 + Math.max(1, tariffCount) * 2
  const density = cols * Math.max(1, rowCount) / Math.max(1, panels)
  if (density > 80) return 8
  if (density > 55) return 9
  if (density > 35) return 10.5
  if (density > 20) return 12
  return 13.5
}
