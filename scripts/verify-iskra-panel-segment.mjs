/**
 * node scripts/verify-iskra-panel-segment.mjs
 */
import {
  buildTrainerContourAlerts,
  filterProactiveAlertsForSegment,
  resolveDefaultPanelSegment,
  resolveSegmentAlerts,
} from '../src/lib/admin/iskraPanelSegmentCore.js'
import {
  buildTrainerInsightCards,
  buildTrainerPanelKpi,
} from '../src/lib/admin/iskraTrainerPanelCore.js'
import { shouldRouteChipToGemini, resolveChipSendOptions } from '../src/lib/admin/iskraChipRoutingCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveDefaultPanelSegment('tr-1') === 'trainer', 'default trainer segment')
ok(resolveDefaultPanelSegment(null) === 'sales', 'default sales segment')

const alerts = [
  { id: 'plan_critical', title: 'План' },
  { id: 'inactive_spike', title: 'Неактивные' },
  { id: 'forecast_miss', title: 'Прогноз' },
]

ok(filterProactiveAlertsForSegment(alerts, 'sales').length === 2, 'sales alerts filter')
ok(filterProactiveAlertsForSegment(alerts, 'trainer').length === 1, 'trainer alerts filter')

const contour = {
  club_roll_up: {
    completed_trainings: 40,
    inactive_clients_holders: 6,
    no_type_trainings_ignored: 3,
    trainers_count: 2,
  },
  trainers: [
    {
      trainer_id: 't1',
      trainer_name: 'Иван',
      completed_trainings: 0,
      inactive_clients_holders: 4,
      no_type_trainings_ignored: 2,
      personal_salary_month: 12000,
      current_active_holders: 8,
    },
  ],
}

const kpi = buildTrainerPanelKpi(contour, 't1')
ok(kpi?.completedTrainings === 0, 'trainer kpi completed')
ok(kpi?.scope === 'trainer', 'trainer kpi scope')

const clubKpi = buildTrainerPanelKpi(contour, null)
ok(clubKpi?.inactiveHolders === 6, 'club rollup inactive')

const extra = buildTrainerContourAlerts(contour, 't1')
ok(extra.some((a) => a.id === 'trainer_inactive_focus'), 'trainer inactive alert')
ok(extra.some((a) => a.id === 'trainer_low_trainings'), 'trainer low trainings alert')

const merged = resolveSegmentAlerts(alerts, contour, 'trainer', 't1')
ok(merged.length >= 2, 'merged trainer alerts')

const cards = buildTrainerInsightCards(contour, { trainerId: 't1', limit: 3 })
ok(cards.length >= 1, 'trainer insight cards')

ok(shouldRouteChipToGemini('plan', 'app_admin'), 'admin plan → gemini')
ok(!shouldRouteChipToGemini('plan', 'club_supervisor'), 'supervisor plan instant')
ok(!shouldRouteChipToGemini('intro', 'app_admin'), 'intro always instant')
ok(!shouldRouteChipToGemini('trainer_summary', 'app_admin'), 'trainer chip instant')

const routed = resolveChipSendOptions({ handler_id: 'plan' }, { advisorRoleId: 'app_admin', responseDepth: 'deep' })
ok(!routed.handlerId && routed.responseMode === 'deep', 'chip send routes plan to deep')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-panel-segment: all checks passed')
