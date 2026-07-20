/**
 * node scripts/verify-iskra-owner-brief.mjs
 */
import {
  buildOwnerMonthBriefModel,
  buildOwnerMonthBriefModelFromPanel,
  buildOwnerMonthBriefPlainText,
} from '../src/lib/admin/iskraOwnerBriefCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const snapshot = {
  club_name: 'Клинцы',
  period: { year: 2026, month: 7, label: 'июль 2026' },
  sales: {
    plan_total: 1000000,
    profit_total: 450000,
    plan_progress_pct: 45,
    days_with_reports: 10,
    report_coverage_pct: 50,
  },
  insights: {
    plan: { pct: 45, has_plan: true, calendar_vs_plan: 'behind', tone: 'weak', calendar_expected_pct: 55 },
  },
  club_finance: { available: true, forecast: { will_reach_plan: false, plan_pct: 78 } },
}

const model = buildOwnerMonthBriefModel(snapshot, {
  clubName: 'Клинцы',
  outcomes: [{ card_id: 'plan_behind_calendar', plan_delta_pct: 3, profit_delta_rub: 20000, label_ru: 'Совет сработал +3%' }],
})
ok(model.title.includes('Клинцы'), 'brief title')
ok(model.kpiRows.length >= 2, 'kpi rows')
ok(model.actions.length >= 0, 'actions array')
ok(buildOwnerMonthBriefPlainText(model).includes('Бриф ИСКРЫ'), 'plain text')

const fromPanel = buildOwnerMonthBriefModelFromPanel({
  clubName: 'Клинцы',
  periodLabel: 'июль 2026',
  kpi: { hasPlan: true, planPct: 45, profitTotal: 450000, reportsLabel: '10 дн.' },
  sparkBrief: { tone: 'warn', lines: ['a', 'риск', 'cta'], forecastLine: 'прогноз' },
  insightCards: [{ headline: 'План отстаёт', action: 'Обзвонить', impactLabel: '≈ 50 тыс ₽', tone: 'warn' }],
  momGlance: { line: 'к прошлому месяцу +10%' },
  outcomes: [{ card_id: 'x', plan_delta_pct: 2, profit_delta_rub: 10000, label_ru: 'Исход +2%' }],
})
ok(fromPanel.risks.length >= 1, 'panel model risks')
ok(fromPanel.outcomeLine.includes('+2%') || fromPanel.outcomeLine.includes('Исход'), 'panel outcome line')

if (failed) process.exit(1)
console.log('verify-iskra-owner-brief: all passed')
