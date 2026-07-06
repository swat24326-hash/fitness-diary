/**
 * План по направлениям ПЗ/ТЗ/АЗ для ЭВС «ИСКРА» — чистые функции.
 */

const CORE_DIRECTION_KEYS = new Set(['pz', 'tz', 'az'])

/**
 * @param {Array<{ key?: string, label?: string, planTarget?: number, planProgressPercent?: number, amount?: number }>} directionRows
 * @param {object | null | undefined} [calendarContext]
 */
export function buildPlanDirectionInsights(directionRows, calendarContext) {
  const rows = (directionRows ?? [])
    .filter((r) => CORE_DIRECTION_KEYS.has(String(r.key ?? '')))
    .map((r) => ({
      key: String(r.key),
      label: String(r.label ?? r.key ?? '').trim() || String(r.key),
      planTarget: Number(r.planTarget) || 0,
      pct: Number(r.planProgressPercent) || 0,
      amount: Number(r.amount) || 0,
    }))

  const withPlan = rows.filter((r) => r.planTarget > 0)
  if (!withPlan.length) {
    return {
      has_direction_plans: false,
      lagging: [],
      ok: [],
      summary_ru: '',
    }
  }

  const expected =
    calendarContext?.month_relation === 'current'
      ? Number(calendarContext.expected_plan_progress_pct) || 0
      : 55
  const slack = calendarContext?.month_relation === 'current' ? 8 : 0

  /** @type {typeof withPlan} */
  const lagging = []
  /** @type {string[]} */
  const ok = []

  for (const row of withPlan) {
    const threshold =
      calendarContext?.month_relation === 'current'
        ? Math.max(5, expected - slack)
        : 55
    if (row.pct < threshold) lagging.push(row)
    else ok.push(row.label)
  }

  lagging.sort((a, b) => a.pct - b.pct)

  let summaryRu = ''
  if (lagging.length) {
    summaryRu = `Отставание по направлениям: ${lagging.map((r) => `${r.label} ${r.pct}%`).join(', ')}.`
  } else if (ok.length) {
    summaryRu = `По направлениям ${ok.join(', ')} — без критичного отставания.`
  }

  return {
    has_direction_plans: true,
    lagging: lagging.map((r) => ({ label: r.label, pct: r.pct, key: r.key })),
    ok,
    worst: lagging[0] ?? null,
    summary_ru: summaryRu,
  }
}

/**
 * @param {{ direction_plan?: ReturnType<typeof buildPlanDirectionInsights>, structure?: { direction_rows?: unknown[] } }} insights
 * @param {ReturnType<typeof buildPlanDirectionInsights>} [directionPlan]
 */
export function formatPlanDirectionLagLine(insights, directionPlan) {
  const block =
    directionPlan ??
    insights?.direction_plan ??
    buildPlanDirectionInsights(insights?.structure?.direction_rows ?? [])
  const summary = String(block?.summary_ru ?? '').trim()
  return summary ? ` ${summary}` : ''
}

/**
 * @param {Array<{ label?: string, key?: string, planProgressPercent?: number, planTarget?: number, amount?: number }>} directionRows
 * @param {ReturnType<typeof buildPlanDirectionInsights>} [directionPlan]
 */
export function formatPlanDirectionsDetail(directionRows, directionPlan) {
  const block =
    directionPlan ?? buildPlanDirectionInsights(directionRows ?? [])
  const rows = (directionRows ?? []).filter((r) => CORE_DIRECTION_KEYS.has(String(r.key ?? '')))
  if (!rows.length && !block.has_direction_plans) {
    return 'план по направлениям не задан или нет данных в отчётах'
  }

  const parts = rows
    .filter((r) => (Number(r.planTarget) || 0) > 0 || (Number(r.amount) || 0) > 0)
    .map((r) => {
      const label = r.label ?? r.key
      const pct = Number(r.planProgressPercent) || 0
      return `${label} ${pct}%`
    })

  if (!parts.length) return 'план по направлениям не задан'

  const tail = block.summary_ru ? ` ${block.summary_ru}` : ''
  return `выполнение — ${parts.join('; ')}.${tail}`
}

/** @param {'sales'|'trainer'} mode */
export function buildIskraAnalysisFocusRule(mode) {
  if (mode === 'trainer') {
    return 'Фокус запроса: конкретный тренер. Отвечай по его тренировкам, клиентам и личной ЗП. План продаж клуба и ПЗ/ТЗ/АЗ — только если явно спросили.'
  }
  return 'Фокус анализа: продажи клуба (отчёт менеджера). Планшеты и тренеры — не упоминай, пока руководитель не спросил про конкретного тренера.'
}
