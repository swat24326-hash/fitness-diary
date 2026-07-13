/**
 * Утренний SparkBrief ИСКРЫ — 3 строки + CTA из snapshot/KPI.
 */

import { buildPanelKpiFromAnalytics } from './clubMonthAnalyticsCore.js'
import { buildEnrichedIskraAdviceCards } from './iskraActionImpactCore.js'
import { formatRubCompact } from './iskraReplyPhrasing.js'
import { buildForecastConfidenceLine } from './iskraForecastConfidenceCore.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, clubName?: string }} [opts]
 */
export function buildIskraSparkBrief(snapshot, opts = {}) {
  const club = String(opts.clubName ?? snapshot?.club_name ?? 'клуб').trim()
  const kpi = buildPanelKpiFromAnalytics(snapshot)
  const cards = buildEnrichedIskraAdviceCards(snapshot, {
    advisorRoleId: opts.advisorRoleId ?? 'app_admin',
    limit: 2,
  })
  const top = cards[0] ?? null
  const planPct = Number(kpi?.planPct) || 0
  const insights = snapshot?.insights ?? {}
  const behind =
    insights.plan?.calendar_vs_plan === 'behind' ||
    insights.plan?.tone === 'weak' ||
    (planPct > 0 && planPct < 45)

  const forecast = buildForecastConfidenceLine(snapshot)

  const line1 = kpi?.hasPlan
    ? `План ${String(planPct).replace('.', ',')}% · ${formatRubCompact(kpi.profitTotal)}`
    : `Продажи ${formatRubCompact(kpi?.profitTotal ?? 0)}`

  let line2 = 'Темп в норме — держите ритм отчётов'
  let tone = 'ok'
  if (behind) {
    line2 = top?.headline ?? 'План отстаёт от календарного темпа'
    tone = 'warn'
  } else if (top) {
    line2 = top.headline
    tone = top.tone === 'warn' ? 'warn' : 'accent'
  } else if (planPct >= 85) {
    line2 = 'План в темпе — можно усилить допродажи'
    tone = 'ok'
  }

  const line3 = top?.action
    ? top.action.length > 96
      ? `${top.action.slice(0, 93)}…`
      : top.action
    : 'Спросите ИСКРУ или нажмите «Сделать»'

  const cta = top
    ? {
        handlerId: top.doHandlerId,
        message: top.doMessage,
        label: top.doLabel ?? 'Сделать',
        cardId: top.id,
      }
    : {
        handlerId: 'plan',
        message: 'Как выполнен план продаж за этот месяц?',
        label: 'План',
        cardId: 'plan',
      }

  return {
    club,
    tone,
    lines: [line1, line2, line3],
    forecastLine: forecast?.line ?? null,
    forecastConfidence: forecast?.confidence ?? null,
    cta,
    planPct,
    topCard: top,
  }
}

/**
 * @param {object | null | undefined} kpi
 * @param {object | null | undefined} [brief]
 */
export function buildMonthRiverDays(kpi, brief) {
  const reportDays = Number(kpi?.report_days ?? kpi?.reportDays) || 0
  const daysInMonth = Number(kpi?.days_in_month ?? kpi?.daysInMonth) || 30
  const planPct = Number(kpi?.plan_progress_pct ?? kpi?.planPct) || 0
  const filled = Math.min(daysInMonth, Math.max(0, reportDays))
  const cells = []
  for (let i = 0; i < daysInMonth; i += 1) {
    const day = i + 1
    let state = 'empty'
    if (i < filled) state = 'filled'
    else if (day <= Math.ceil((daysInMonth * planPct) / 100)) state = 'expected'
    cells.push({ day, state })
  }
  return {
    cells: cells.slice(0, 31),
    reportDays: filled,
    daysInMonth,
    label: `${filled}/${daysInMonth} отчётов`,
    tone: filled === 0 ? 'warn' : filled < daysInMonth * 0.5 ? 'accent' : 'ok',
    briefTone: brief?.tone ?? 'neutral',
  }
}
