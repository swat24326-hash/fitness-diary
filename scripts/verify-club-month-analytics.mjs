import {
  applyMonthComparisonInsights,
  buildClubMonthAnalytics,
  buildClubMonthInsights,
  buildPanelKpiFromAnalytics,
} from '../src/lib/admin/clubMonthAnalyticsCore.js'
import { buildSalesManagerMonthStats } from '../src/lib/admin/salesManagerStatsAgg.js'
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  {
    report_date: '2026-06-01',
    profit_nk: 1000,
    profit_dk: 500,
    profit_uk: 0,
    trainings_count: 10,
    pnk_total: 5,
    pz_nk: 2,
    pz_dk: 1,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 4 }],
  },
  {
    report_date: '2026-06-15',
    profit_nk: 5000,
    profit_dk: 0,
    profit_uk: 100,
    trainings_count: 8,
    pnk_total: 3,
    tz_nk: 3,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 2 }],
  },
]

const membershipTypes = [{ id: 't1', code: 'VIP' }]

const analytics = buildClubMonthAnalytics({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000 },
  expenseAmount: 1000,
  payrollClubTotal: 2000,
  aerobicPayrollClubTotal: 500,
  fitCityCompleted: 15,
  inactiveInPeriod: 3,
  trainingCompleted: 40,
  membershipTypes,
})

ok(analytics.sales.profit_total === 6600, 'analytics profit total')
ok(analytics.insights?.plan?.pct === 66, 'insights plan pct')
ok(analytics.insights?.pnk?.total === 8, 'insights pnk total')
ok(analytics.insights?.pnk?.tone === 'ok', 'insights pnk tone')
ok(analytics.insights?.fitcity?.status === 'manager_higher', 'fitcity status manager higher')
ok(analytics.insights?.fitcity?.gap === 3, 'fitcity gap')
ok(analytics.insights?.finance?.payroll_share_pct > 0, 'finance payroll share')
ok(analytics.insights?.finance?.aerobic_payroll_share_pct > 0, 'finance aerobic share')
ok(analytics.insights?.highlights?.best_day?.profit === 5100, 'insights best day')
ok(Array.isArray(analytics.insights?.structure?.rows), 'structure rows')
ok(analytics.sales.structure_shares?.length === 4, 'structure shares include dop')
ok(Array.isArray(analytics.sales.direction_structure), 'direction structure in sales')

const geminiSnap = buildGeminiSnapshot({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000 },
  payrollClubTotal: 2000,
  fitCityCompleted: 15,
  membershipTypes,
})
ok(geminiSnap.insights?.plan?.pct === analytics.insights.plan.pct, 'gemini snapshot uses same analytics')

const stats = buildSalesManagerMonthStats({
  monthRows: rows,
  planLevels: { level1: 3000, level2: 6000, level3: 10000 },
  membershipTypes,
  year: 2026,
  month: 6,
})
ok(stats.summary.profitTotal === analytics.sales.profit_total, 'parity with salesManagerStatsAgg')

const prev = buildClubMonthAnalytics({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 5,
  monthRows: [{ report_date: '2026-05-10', profit_nk: 2000, profit_dk: 0, profit_uk: 0, trainings_count: 1 }],
  plan: { plan_total: 10000 },
  fitCityCompleted: 1,
  membershipTypes,
})
applyMonthComparisonInsights(analytics, prev)
ok(analytics.insights.mom_comparison?.profit_delta === 4600, 'mom profit delta')
ok(analytics.insights.mom_comparison?.profit_direction === 'up', 'mom direction up')

const emptyPrev = buildClubMonthAnalytics({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 5,
  monthRows: [],
  plan: { plan_total: 10000 },
  membershipTypes,
})
const analyticsJuly = buildClubMonthAnalytics({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 7,
  monthRows: rows,
  plan: { plan_total: 10000, plan_level_3: 10000 },
  membershipTypes,
})
applyMonthComparisonInsights(analyticsJuly, emptyPrev)
const momEmpty = analyticsJuly.insights.mom_comparison
ok(momEmpty?.profit_previous_missing, 'mom profit missing when prev empty')
ok(momEmpty?.profit_delta_pct == null, 'mom no fake 100 pct')
ok(momEmpty?.plan_previous_missing, 'mom plan missing when prev empty')
ok(momEmpty?.plan_direction == null, 'mom no plan direction without base')

const kpi = buildPanelKpiFromAnalytics(analytics)
ok(kpi?.pzTrainings === 6, 'panel kpi pz trainings from manager matrix')
ok(kpi?.reportsLabel === '2/30', 'panel kpi reports label')

const lowCoverage = buildClubMonthInsights({
  stats,
  managerTrainingsTotal: 18,
  fitCityCompleted: 15,
  inactiveInPeriod: 0,
  finance: analytics.finance,
  includeFinance: true,
})
ok(lowCoverage.report.coverage_pct > 0 && lowCoverage.report.coverage_pct < 15, 'sparse report coverage tracked')
ok(!lowCoverage.issues.some((i) => i.id === 'low_coverage'), 'low_coverage issue removed from risk list')

const inactiveIssue = buildClubMonthInsights({
  stats,
  managerTrainingsTotal: 18,
  fitCityCompleted: 15,
  inactiveInPeriod: 6,
  finance: analytics.finance,
  includeFinance: true,
})
ok(inactiveIssue.issues.some((i) => i.id === 'inactive_clients'), 'inactive clients issue')

process.exit(failed > 0 ? 1 : 0)
