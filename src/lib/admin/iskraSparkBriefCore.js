import { buildPanelKpiFromAnalytics } from './clubMonthAnalyticsCore.js'
import { buildEnrichedIskraAdviceCards } from './iskraActionImpactCore.js'
import { formatPctPlain, formatRubCompact, phrasePlanBenchmark } from './iskraReplyPhrasing.js'
import { buildForecastConfidenceLine } from './iskraForecastConfidenceCore.js'
import {
  pickPrimarySeedPlaybook,
  seedPlaybookActionLine,
} from './iskraBusinessPlaybooksCore.js'
import { buildDirectionGlanceLine } from './iskraSalesAdviceContextCore.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, clubName?: string, outcomeLine?: string | null, hour?: number }} [opts]
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
  const expectedPlanPct = Number(kpi?.expectedPlanPct)
  const hasExpected = Number.isFinite(expectedPlanPct) && expectedPlanPct > 0
  const insights = snapshot?.insights ?? {}
  const calendarBehind = hasExpected && planPct + 5 < expectedPlanPct
  const behind =
    calendarBehind ||
    insights.plan?.calendar_vs_plan === 'behind' ||
    insights.plan?.tone === 'weak' ||
    (planPct > 0 && !hasExpected && planPct < 45)

  const forecast = buildForecastConfidenceLine(snapshot)
  const directionGlance = buildDirectionGlanceLine(snapshot)
  const seedPlaybook = behind || top?.tone === 'warn' ? pickPrimarySeedPlaybook(snapshot) : null
  const outcomeLine =
    typeof opts.outcomeLine === 'string' && opts.outcomeLine.trim()
      ? opts.outcomeLine.trim()
      : null

  const hour = Number(opts.hour)
  const morning = Number.isFinite(hour) ? hour >= 5 && hour < 11 : false

  const line1 = kpi?.hasPlan
    ? [
        `План ${formatPctPlain(planPct)}%`,
        hasExpected ? phrasePlanBenchmark(expectedPlanPct) : null,
        formatRubCompact(kpi.profitTotal),
      ]
        .filter(Boolean)
        .join(' · ')
    : `Продажи ${formatRubCompact(kpi?.profitTotal ?? 0)}`

  let line2 = morning ? 'Утро: темп в норме — держите ритм отчётов' : 'Темп в норме — держите ритм отчётов'
  let tone = 'ok'
  if (outcomeLine && !behind) {
    line2 = outcomeLine.length > 96 ? `${outcomeLine.slice(0, 93)}…` : outcomeLine
    tone = 'accent'
  } else if (behind) {
    line2 =
      directionGlance?.line ??
      (hasExpected
        ? `Отстаёте от нормы к дате (${formatPctPlain(planPct)}% при ${formatPctPlain(expectedPlanPct)}%)`
        : null) ??
      top?.headline ??
      'План отстаёт от календарного темпа'
    tone = 'warn'
  } else if (top) {
    line2 = top.headline
    tone = top.tone === 'warn' ? 'warn' : 'accent'
  } else if (hasExpected && planPct + 2 >= expectedPlanPct) {
    line2 = 'План в темпе к дате — можно усилить допродажи'
    tone = 'ok'
  } else if (planPct >= 85) {
    line2 = 'План в темпе — можно усилить допродажи'
    tone = 'ok'
  }

  const line3 = seedPlaybook
    ? seedPlaybookActionLine(seedPlaybook)
    : top?.action
      ? top.action.length > 96
        ? `${top.action.slice(0, 93)}…`
        : top.action
      : morning
        ? 'Откройте «Сделать» или спросите ИСКРУ за 30 секунд'
        : 'Спросите «Совет по плану» или нажмите «Сделать»'

  const cta = behind || seedPlaybook
    ? {
        handlerId: 'advice_plan',
        message:
          'Дай совет: какое направление просело и что делать по НК/ДК/УК и ПЗ/ТЗ/АЗ, чтобы дожать план?',
        label: 'Совет по плану',
        cardId: 'advice_plan',
      }
    : top
      ? {
          handlerId: top.doHandlerId,
          message: top.doMessage,
          label: top.doLabel ?? 'Сделать',
          cardId: top.id,
        }
      : {
          handlerId: 'advice_plan',
          message:
            'Дай совет: какое направление просело и что делать по НК/ДК/УК и ПЗ/ТЗ/АЗ, чтобы дожать план?',
          label: 'Совет по плану',
          cardId: 'advice_plan',
        }

  return {
    club,
    tone,
    lines: [line1, line2, line3],
    forecastLine: forecast?.line ?? null,
    forecastConfidence: forecast?.confidence ?? null,
    cta,
    planPct,
    expectedPlanPct: hasExpected ? expectedPlanPct : null,
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
