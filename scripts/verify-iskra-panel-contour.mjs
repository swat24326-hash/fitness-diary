/**
 * node scripts/verify-iskra-panel-contour.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildGeminiPromptDataBlock } from '../src/lib/admin/geminiAnalyticsPrompt.js'
import {
  buildAdviceModeRule,
  filterPromptDataBlockForSegment,
  isIskraAdviceQuestion,
  resolvePanelAnalysisFocus,
} from '../src/lib/admin/iskraPanelContourCore.js'
import {
  buildDirectionGlanceLine,
  buildSalesAdviceContext,
} from '../src/lib/admin/iskraSalesAdviceContextCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolvePanelAnalysisFocus({ segment: 'sales' }) === 'sales', 'sales focus')
ok(resolvePanelAnalysisFocus({ segment: 'trainer', trainerId: 't1' }) === 'trainer', 'trainer focus')
ok(isIskraAdviceQuestion('Дай совет как дожать план'), 'advice detect')

const snap = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 6,
  monthRows: [{ date: '2026-06-10', profit_total: 50000, trainings_pz: 12 }],
  plan: { total: 1000000, level_1: 300000 },
  includeFinance: true,
})

const salesBlock = buildGeminiPromptDataBlock(snap, null, {
  advisorRoleId: 'app_admin',
  responseMode: 'standard',
  panelSegment: 'sales',
})
ok(salesBlock.panel_segment === 'sales', 'block sales segment')
ok(salesBlock.sales_advice_context?.source === 'sales_manager_reports', 'sales advice context')
ok(!salesBlock.trainers_summary, 'sales no trainers summary')

const trainerBlock = buildGeminiPromptDataBlock(snap, null, {
  advisorRoleId: 'app_admin',
  responseMode: 'standard',
  panelSegment: 'trainer',
  selectedTrainerId: 't1',
})
ok(trainerBlock.panel_segment === 'trainer', 'block trainer segment')
ok(trainerBlock.sales_contour == null, 'trainer strips sales')
ok(trainerBlock.finance == null, 'trainer strips finance')

const filtered = filterPromptDataBlockForSegment(salesBlock, 'sales')
ok(filtered.sales_inactive_signal == null || filtered.sales_inactive_signal >= 0, 'inactive signal ok')

const adviceRule = buildAdviceModeRule('Как дожать план?', 'sales')
ok(adviceRule.includes('отстающее направление'), 'advice rule sales')

const glance = buildDirectionGlanceLine({
  insights: {
    direction_plan: {
      has_direction_plans: true,
      lagging: [{ label: 'ПЗ', pct: 32 }],
      worst: { label: 'ПЗ', pct: 32 },
    },
  },
})
ok(glance?.line?.includes('ПЗ'), 'direction glance')

const ctx = buildSalesAdviceContext({
  sales: { profit_total: 100000, pz_trainings_from_manager_reports: 20, plan_progress_pct: 45 },
  insights: { direction_plan: { has_direction_plans: true, worst: { label: 'ПЗ', pct: 32 } } },
  trainer_contour: { club_roll_up: { inactive_clients_holders: 5 } },
})
ok(ctx?.pz_trainings_manager_reports === 20, 'pz from manager')
ok(ctx?.inactive_clients_sales_signal === 5, 'inactive signal')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-panel-contour: all checks passed')
