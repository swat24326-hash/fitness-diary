/**
 * node scripts/verify-iskra-proactive.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { applyMonthComparisonInsights } from '../src/lib/admin/clubMonthAnalyticsCore.js'
import { buildPanelKpiFromAnalytics } from '../src/lib/admin/clubMonthAnalyticsCore.js'
import { buildIskraProactiveAlerts } from '../src/lib/admin/iskraProactiveAlertsCore.js'
import { buildForecastConfidenceLine } from '../src/lib/admin/iskraForecastConfidenceCore.js'
import { buildMomGlanceLine } from '../src/lib/admin/iskraMomGlanceCore.js'
import { buildWeekChecklistItems } from '../src/lib/admin/iskraWeekChecklistCore.js'
import { deriveSourceFactsForReply } from '../src/lib/admin/iskraReplySourceFactsCore.js'
import { buildIskraSparkBrief } from '../src/lib/admin/iskraSparkBriefCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const snap = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 6,
  monthRows: [{ report_date: '2026-06-10', profit_nk: 500, profit_dk: 1000, trainings_count: 3 }],
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000 },
  includeFinance: true,
  expenseAmount: 500,
  payrollClubTotal: 800,
  inactiveInPeriod: 6,
})

const kpi = buildPanelKpiFromAnalytics(snap)
const alerts = buildIskraProactiveAlerts(snap, kpi)
ok(alerts.some((a) => a.id === 'plan_critical' || a.id === 'no_reports'), 'proactive alerts fire')

const prev = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 5,
  monthRows: [{ report_date: '2026-05-10', profit_nk: 2000, profit_dk: 3000, trainings_count: 5 }],
  plan: { plan_total: 9000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 9000 },
  includeFinance: false,
})
applyMonthComparisonInsights(snap, prev)
const mom = buildMomGlanceLine(snap)
ok(mom?.line?.includes('прибыль'), 'mom glance line')

snap.club_finance = {
  available: true,
  forecast: { plan_pct: 72, will_reach_plan: false },
}
snap.sales = { ...snap.sales, report_coverage_pct: 55, days_with_reports: 8 }
snap.calendar_context = { days_elapsed: 12, days_in_month: 30 }

const forecast = buildForecastConfidenceLine(snap)
ok(forecast?.line?.includes('Прогноз'), 'forecast confidence line')
ok(['high', 'medium', 'low'].includes(forecast.confidence), 'forecast confidence enum')

const checklist = buildWeekChecklistItems(snap, { limit: 3 })
ok(checklist.length >= 1, 'week checklist items')

const facts = deriveSourceFactsForReply(snap, 'Как выполнен план продаж?', { handlerId: 'plan' })
ok(facts.length >= 1, 'source facts for plan')

const brief = buildIskraSparkBrief(snap, { clubName: 'Север' })
ok(brief.forecastLine, 'spark brief forecast line')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-proactive: all checks passed')
