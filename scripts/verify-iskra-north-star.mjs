/**
 * node scripts/verify-iskra-north-star.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildPanelKpiFromAnalytics } from '../src/lib/admin/clubMonthAnalyticsCore.js'
import {
  buildEnrichedIskraAdviceCards,
  enrichAdviceCardWithImpact,
  estimateAdviceImpactRub,
  ISKRA_ADVICE_DO_ACTIONS,
} from '../src/lib/admin/iskraActionImpactCore.js'
import { buildIskraSparkBrief, buildMonthRiverDays } from '../src/lib/admin/iskraSparkBriefCore.js'

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
    profit_dk: 5000,
    profit_uk: 0,
    trainings_count: 10,
    pnk_total: 2,
    pz_nk: 1,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 4 }],
  },
  {
    report_date: '2026-06-15',
    profit_nk: 500,
    profit_dk: 2000,
    profit_uk: 100,
    trainings_count: 8,
    pnk_total: 1,
    tz_nk: 1,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 2 }],
  },
]

const snap = buildGeminiSnapshot({
  clubName: 'FIT-CITY Север',
  year: 2026,
  month: 6,
  monthRows: rows,
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000, plan_pz: 4000 },
  expenseAmount: 1000,
  payrollClubTotal: 2000,
  fitCityCompleted: 15,
  inactiveInPeriod: 3,
  trainingCompleted: 40,
  membershipTypes: [{ id: 't1', code: 'VIP' }],
  includeFinance: true,
})

const kpi = buildPanelKpiFromAnalytics(snap)
ok(kpi?.plan_progress_pct != null, 'kpi plan_progress_pct alias')
ok(kpi?.report_days === 2, 'kpi report_days')

const impact = estimateAdviceImpactRub('plan_behind_calendar', snap)
ok(impact == null || impact >= 0, 'impact rub estimate')

const cards = buildEnrichedIskraAdviceCards(snap, { limit: 3 })
ok(cards.length >= 1, 'enriched advice cards')
ok(cards[0].doHandlerId, 'card do handler')
const enriched = enrichAdviceCardWithImpact(cards[0], snap)
ok(enriched.doMessage, 'enriched do message')

const brief = buildIskraSparkBrief(snap, { clubName: 'Север' })
ok(brief.lines.length === 3, 'spark brief 3 lines')
ok(brief.cta?.message, 'spark brief cta')

const snapWithNorm = {
  ...snap,
  calendar_context: {
    ...(snap.calendar_context ?? {}),
    expected_plan_progress_pct: 60,
    month_relation: 'current',
  },
}
const kpiNorm = buildPanelKpiFromAnalytics(snapWithNorm)
ok(kpiNorm?.expectedPlanPct === 60, 'kpi expected plan pct')
const briefNorm = buildIskraSparkBrief(snapWithNorm, { clubName: 'Север' })
ok(/норма к дате/i.test(briefNorm.lines[0] ?? ''), 'spark brief has norm-to-date')

const river = buildMonthRiverDays(kpi)
ok(river.cells.length >= 28, 'month river cells')
ok(river.label.includes('2/'), 'month river label')

ok(ISKRA_ADVICE_DO_ACTIONS.plan_behind_calendar?.handlerId === 'advice_plan', 'do action map')

if (failed) process.exit(1)
console.log('verify-iskra-north-star: all passed')
