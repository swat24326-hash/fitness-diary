/**
 * Модель брифа месяца для собственника (печать / PDF через print).
 * scripts/verify-iskra-owner-brief.mjs
 */

import { buildPanelKpiFromAnalytics } from './clubMonthAnalyticsCore.js'
import { buildEnrichedIskraAdviceCards } from './iskraActionImpactCore.js'
import { buildIskraSparkBrief } from './iskraSparkBriefCore.js'
import { buildMomGlanceLine } from './iskraMomGlanceCore.js'
import { formatRubCompact } from './iskraReplyPhrasing.js'
import { buildAdviceOutcomeSparkLine } from './iskraAdviceOutcomeCore.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {{
 *   clubName?: string,
 *   previousSnapshot?: object | null,
 *   outcomes?: Array<object>,
 *   advisorRoleId?: string,
 * }} [opts]
 */
export function buildOwnerMonthBriefModel(snapshot, opts = {}) {
  const club = String(opts.clubName ?? snapshot?.club_name ?? 'Клуб').trim()
  const periodLabel = String(snapshot?.period?.label ?? 'месяц').trim()
  const kpi = buildPanelKpiFromAnalytics(snapshot)
  const outcomeLine = buildAdviceOutcomeSparkLine(opts.outcomes ?? [])
  const spark = buildIskraSparkBrief(snapshot, {
    clubName: club,
    advisorRoleId: opts.advisorRoleId ?? 'app_admin',
    outcomeLine: outcomeLine ?? undefined,
    hour: new Date().getHours(),
  })
  const cards = buildEnrichedIskraAdviceCards(snapshot, {
    advisorRoleId: opts.advisorRoleId ?? 'app_admin',
    limit: 3,
  })
  const mom = buildMomGlanceLine(snapshot, opts.previousSnapshot)

  const kpiRows = [
    {
      label: 'План',
      value: kpi?.hasPlan ? `${String(kpi.planPct).replace('.', ',')}%` : 'не задан',
    },
    {
      label: 'Продажи',
      value: formatRubCompact(kpi?.profitTotal ?? 0),
    },
    {
      label: 'Отчёты',
      value: kpi?.reportsLabel ?? '—',
    },
  ]

  const risks = []
  if (spark?.tone === 'warn' && spark.lines?.[1]) risks.push(spark.lines[1])
  for (const c of cards) {
    if (c.tone === 'warn' && c.headline) risks.push(c.headline)
  }

  const actions = cards.slice(0, 3).map((c) => ({
    title: c.headline,
    action: c.action,
    impact: c.impactLabel ?? null,
  }))

  return {
    title: `Бриф ИСКРЫ — ${club}`,
    subtitle: periodLabel,
    generatedAt: new Date().toISOString(),
    kpiRows,
    momLine: mom?.line ?? null,
    outcomeLine,
    sparkLines: spark?.lines ?? [],
    forecastLine: spark?.forecastLine ?? null,
    risks: [...new Set(risks)].slice(0, 4),
    actions,
    footer: 'FIT-CITY · ИСКРА · для служебного пользования',
  }
}

/**
 * Модель из уже загруженного prefetch панели (без повторного snapshot).
 * @param {{
 *   clubName?: string,
 *   periodLabel?: string,
 *   kpi?: object | null,
 *   sparkBrief?: object | null,
 *   insightCards?: Array<object>,
 *   momGlance?: { line?: string } | null,
 *   forecastConfidence?: { line?: string } | null,
 *   outcomes?: Array<object>,
 * }} input
 */
export function buildOwnerMonthBriefModelFromPanel(input = {}) {
  const club = String(input.clubName ?? 'Клуб').trim()
  const periodLabel = String(input.periodLabel ?? 'месяц').trim()
  const kpi = input.kpi
  const spark = input.sparkBrief
  const cards = Array.isArray(input.insightCards) ? input.insightCards : []
  const outcomeLine = buildAdviceOutcomeSparkLine(input.outcomes ?? [])

  const kpiRows = [
    {
      label: 'План',
      value: kpi?.hasPlan ? `${String(kpi.planPct).replace('.', ',')}%` : 'не задан',
    },
    {
      label: 'Продажи',
      value: formatRubCompact(kpi?.profitTotal ?? 0),
    },
    {
      label: 'Отчёты',
      value: kpi?.reportsLabel ?? '—',
    },
  ]

  const risks = []
  if (spark?.tone === 'warn' && spark.lines?.[1]) risks.push(spark.lines[1])
  for (const c of cards) {
    if (c.tone === 'warn' && c.headline) risks.push(c.headline)
  }

  const actions = cards.slice(0, 3).map((c) => ({
    title: c.headline,
    action: c.action,
    impact: c.impactLabel ?? null,
  }))

  return {
    title: `Бриф ИСКРЫ — ${club}`,
    subtitle: periodLabel,
    generatedAt: new Date().toISOString(),
    kpiRows,
    momLine: input.momGlance?.line ?? null,
    outcomeLine,
    sparkLines: spark?.lines ?? [],
    forecastLine: spark?.forecastLine ?? input.forecastConfidence?.line ?? null,
    risks: [...new Set(risks)].slice(0, 4),
    actions,
    footer: 'FIT-CITY · ИСКРА · для служебного пользования',
  }
}

/**
 * @param {ReturnType<typeof buildOwnerMonthBriefModel>} model
 */
export function buildOwnerMonthBriefPlainText(model) {
  if (!model) return ''
  const lines = [
    model.title,
    model.subtitle,
    '',
    ...model.kpiRows.map((r) => `${r.label}: ${r.value}`),
  ]
  if (model.momLine) lines.push('', model.momLine)
  if (model.outcomeLine) lines.push(model.outcomeLine)
  if (model.forecastLine) lines.push(model.forecastLine)
  if (model.risks?.length) {
    lines.push('', 'Риски:')
    for (const r of model.risks) lines.push(`· ${r}`)
  }
  if (model.actions?.length) {
    lines.push('', 'Действия:')
    for (const a of model.actions) {
      lines.push(`· ${a.title}${a.impact ? ` (${a.impact})` : ''}`)
      if (a.action) lines.push(`  ${a.action}`)
    }
  }
  lines.push('', model.footer)
  return lines.join('\n')
}
