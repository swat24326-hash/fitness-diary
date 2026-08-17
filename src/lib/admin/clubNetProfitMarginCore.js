/**
 * Рентабельность по валу: чистая прибыль ÷ валовая выручка × 100%.
 * Оценка для клуба: <15% риск, ~20% норма, ≥25% отлично.
 *
 * Вал = Σ profit_day (gross), как для плана; чистая = после возвратов, ЗП и расхода.
 */

/** @typedef {'weak' | 'ok' | 'strong' | 'muted'} NetProfitMarginTone */

export const NET_PROFIT_MARGIN_WEAK_BELOW = 15
export const NET_PROFIT_MARGIN_OK_FROM = 20
export const NET_PROFIT_MARGIN_STRONG_FROM = 25

/** Каноническое имя показателя в UI и ИСКРЕ. */
export const NET_PROFIT_MARGIN_LABEL_RU = 'Рентабельность по валу'

/** Короткая подпись для компактных полос (Стратегия). */
export const NET_PROFIT_MARGIN_LABEL_SHORT_RU = 'Рент-ть валу'

export const NET_PROFIT_MARGIN_HINT_RU =
  'Чистая ÷ вал × 100%. Ниже 15% — риск, ~20% норма, от 25% — отлично.'

/**
 * @param {number} netProfit
 * @param {number} grossRevenue — вал (profit_day gross, без вычета возвратов из плана)
 * @returns {number | null} доля в %, одна десятая; null если вал ≤ 0
 */
export function computeNetProfitMarginPercent(netProfit, grossRevenue) {
  const gross = Number(grossRevenue) || 0
  if (gross <= 0) return null
  const net = Number(netProfit) || 0
  return Math.round((net / gross) * 1000) / 10
}

/**
 * @param {number | null | undefined} percent
 * @returns {{ tone: NetProfitMarginTone, labelRu: string }}
 */
export function describeNetProfitMarginTone(percent) {
  if (percent == null) {
    return { tone: 'muted', labelRu: 'нет вала' }
  }
  const n = Number(percent)
  if (!Number.isFinite(n)) {
    return { tone: 'muted', labelRu: 'нет вала' }
  }
  if (n < 0) {
    return { tone: 'weak', labelRu: 'убыток' }
  }
  if (n < NET_PROFIT_MARGIN_WEAK_BELOW) {
    return { tone: 'weak', labelRu: 'риск' }
  }
  if (n >= NET_PROFIT_MARGIN_STRONG_FROM) {
    return { tone: 'strong', labelRu: 'отлично' }
  }
  return { tone: 'ok', labelRu: 'норма' }
}

/**
 * @param {number | null | undefined} percent
 * @returns {string}
 */
export function formatNetProfitMarginPercent(percent) {
  if (percent == null) return '—'
  const n = Number(percent)
  if (!Number.isFinite(n)) return '—'
  return `${String(n).replace('.', ',')}%`
}

/**
 * @param {number} netProfit
 * @param {number} grossRevenue
 * @returns {{
 *   pct: number | null,
 *   tone: NetProfitMarginTone,
 *   label_ru: string,
 *   net_profit_margin_pct?: number,
 *   net_profit_margin_tone?: NetProfitMarginTone,
 *   net_profit_margin_label_ru?: string,
 * }}
 */
export function buildNetProfitMarginMeta(netProfit, grossRevenue) {
  const pct = computeNetProfitMarginPercent(netProfit, grossRevenue)
  const { tone, labelRu } = describeNetProfitMarginTone(pct)
  return {
    pct,
    tone,
    label_ru: labelRu,
    net_profit_margin_pct: pct ?? undefined,
    net_profit_margin_tone: tone,
    net_profit_margin_label_ru: labelRu,
  }
}

/**
 * @param {Record<string, unknown>} snapshot — fact или forecast из buildClubFinanceForecast
 * @returns {Record<string, unknown>}
 */
export function enrichFinanceSnapshotWithNetProfitMargin(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  const margin = buildNetProfitMarginMeta(snapshot.netProfit, snapshot.earningsGross)
  return {
    ...snapshot,
    netProfitMargin: margin.pct,
    netProfitMarginTone: margin.tone,
    netProfitMarginLabelRu: margin.label_ru,
  }
}
