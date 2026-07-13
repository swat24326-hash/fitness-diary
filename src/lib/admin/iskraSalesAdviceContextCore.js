/**
 * Контекст бизнес-советов ИСКРЫ — только отчёт менеджера (sales_contour).
 */

import { formatRubCompact } from './iskraReplyPhrasing.js'

/**
 * @param {object | null | undefined} snapshot
 */
export function buildSalesAdviceContext(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null

  const sales = snapshot.sales ?? {}
  const insights = snapshot.insights ?? {}
  const direction = insights.direction_plan ?? {}
  const profit = Number(sales.profit_total) || 0
  const profitGross = Number(sales.profit_gross_total ?? sales.plan_fact_gross) || 0
  const pz = Number(sales.pz_trainings_from_manager_reports) || 0
  const planPct = Number(sales.plan_progress_pct ?? insights.plan?.pct) || 0
  const inactive =
    Number(snapshot.trainer_contour?.club_roll_up?.inactive_clients_holders) || 0

  /** @type {string[]} */
  const hints = []

  if (direction.has_direction_plans && direction.worst) {
    hints.push(
      `Главное отставание: ${direction.worst.label} ${String(direction.worst.pct).replace('.', ',')}% плана направления`,
    )
  }

  if (planPct > 0) {
    hints.push(`Общий план продаж: ${String(planPct).replace('.', ',')}%`)
  }

  if (pz > 0) {
    hints.push(`ПЗ из отчётов менеджера за месяц: ${pz}`)
    if (profit > 0) {
      const perSession = Math.round(profit / pz)
      hints.push(`Выручка ${formatRubCompact(profit)} — около ${formatRubCompact(perSession)} на ПЗ-тренировку (оценка по отчёту)`)
    }
  }

  if (inactive >= 3) {
    hints.push(`Неактивных клиентов (сигнал для отдела продаж): ${inactive}`)
  }

  const structure = insights.structure ?? {}
  const shares = sales.structure_shares ?? {}
  if (shares.nk != null || shares.dk != null) {
    hints.push(
      `Структура: НК ${String(shares.nk ?? structure.nk_share ?? '—').toString().replace('.', ',')}%, ДК ${String(shares.dk ?? structure.dk_share ?? '—').toString().replace('.', ',')}%`,
    )
  }

  return {
    source: 'sales_manager_reports',
    plan_progress_pct: planPct,
    profit_total: profit,
    profit_gross_total: profitGross,
    pz_trainings_manager_reports: pz,
    direction_lagging: Array.isArray(direction.lagging) ? direction.lagging : [],
    worst_direction: direction.worst ?? null,
    inactive_clients_sales_signal: inactive > 0 ? inactive : null,
    correlation_hints: [
      pz > 0 && direction.worst
        ? 'Связывай отставание направления с ПЗ/выручкой только из отчётов менеджера'
        : null,
      inactive >= 3 ? 'Неактивные — повод для реактивации в отделе продаж' : null,
    ].filter(Boolean),
    summary_ru: hints.join('. '),
  }
}

/**
 * @param {object | null | undefined} snapshot
 * @returns {{ line: string } | null}
 */
export function buildDirectionGlanceLine(snapshot) {
  const direction = snapshot?.insights?.direction_plan
  if (!direction?.has_direction_plans) return null

  const worst = direction.worst
  const lagging = Array.isArray(direction.lagging) ? direction.lagging : []
  if (!worst && !lagging.length) {
    const ok = direction.ok ?? []
    if (ok.length) {
      return { line: `Направления ${ok.join(', ')} — без критичного отставания` }
    }
    return null
  }

  const parts = lagging.length
    ? lagging.map((r) => `${r.label} ${String(r.pct).replace('.', ',')}%`)
    : worst
      ? [`${worst.label} ${String(worst.pct).replace('.', ',')}%`]
      : []

  return { line: `Отстаёт: ${parts.join(', ')}` }
}
