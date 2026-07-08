/** Проверка: какие данные ИСКРА может взять из приложения, а где — оценка с предупреждением. */

import { buildIskraDataAvailability, ISKRA_ESTIMATE_DISCLAIMER_RU } from '../src/lib/admin/iskraDataAvailability.js'
import { buildIskraEstimatePolicyRule } from '../src/lib/admin/geminiIskraCore.js'
import { buildGeminiPromptDataBlock } from '../src/lib/admin/geminiAnalyticsPrompt.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

const baseSnapshot = {
  club_name: 'Тест',
  period: { year: 2026, month: 7, label: 'июль 2026', days_in_month: 31 },
  sales: {
    days_with_reports: 10,
    report_coverage_pct: 50,
    plan_total: 1_000_000,
    profit_total: 200_000,
    profit_gross_total: 220_000,
    refunds_total: 20_000,
  },
  insights: {
    direction_plan: { has_direction_plans: true },
    mom_comparison: { profit_delta_pct: 5 },
  },
  finance: { net_profit: 50_000, trainer_payroll: 30_000 },
  month_forecast: {
    available: true,
    forecast_gross_total: 900_000,
    plan_level_3: 1_000_000,
  },
  trainer_contour: { trainers: [{ trainer_id: 't1', name: 'Иван' }] },
}

const full = buildIskraDataAvailability(baseSnapshot, { hasPreviousPeriod: true })
ok(full.policy === 'app_data_first_then_disclosed_estimate', 'policy id')
ok(full.estimate_allowed === true, 'estimate allowed')
ok(full.estimate_disclaimer_ru === ISKRA_ESTIMATE_DISCLAIMER_RU, 'disclaimer text')
ok(full.unavailable_topic_ids.length === 0, 'all topics available in full snapshot')

const noForecast = buildIskraDataAvailability(
  {
    ...baseSnapshot,
    month_forecast: { available: false, reason: 'insufficient_reports', min_report_days: 3, report_days: 1 },
  },
  { hasPreviousPeriod: true },
)
ok(noForecast.unavailable_topic_ids.includes('month_forecast'), 'month_forecast missing flagged')
ok(
  noForecast.topics.find((t) => t.id === 'month_forecast')?.hint_ru?.includes('3'),
  'month_forecast hint mentions min reports',
)

const noFinance = buildIskraDataAvailability(
  { ...baseSnapshot, finance: undefined },
  { hasPreviousPeriod: false },
)
ok(noFinance.unavailable_topic_ids.includes('finance'), 'finance missing flagged')
ok(noFinance.unavailable_topic_ids.includes('mom_comparison'), 'mom missing without previous period')

const noPlan = buildIskraDataAvailability(
  {
    ...baseSnapshot,
    sales: { ...baseSnapshot.sales, plan_total: 0, plan_level_3: 0 },
  },
  { hasPreviousPeriod: true },
)
ok(noPlan.unavailable_topic_ids.includes('sales_plan'), 'sales plan missing flagged')

const promptRule = buildIskraEstimatePolicyRule()
ok(promptRule.includes(ISKRA_ESTIMATE_DISCLAIMER_RU), 'estimate rule has disclaimer')
ok(promptRule.includes('data_availability'), 'estimate rule references availability block')

const dataBlock = buildGeminiPromptDataBlock(baseSnapshot)
ok(dataBlock.data_availability?.topics?.length >= 5, 'prompt data block includes availability')
ok(Array.isArray(dataBlock.data_availability.unavailable_labels_ru), 'unavailable labels array')

console.log('verify-iskra-data-availability: all passed')
