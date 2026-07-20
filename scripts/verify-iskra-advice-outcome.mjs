/**
 * node scripts/verify-iskra-advice-outcome.mjs
 */
import {
  adviceBaselineToLearningEvent,
  adviceOutcomeToLearningEvent,
  buildAdviceOutcomeSparkLine,
  buildAdviceOutcomesPromptBlock,
  captureAdviceBaseline,
  encodeAdviceBaselineNote,
  parseAdviceBaselineNote,
  settleAdviceOutcome,
  settleOpenAdviceBaselines,
} from '../src/lib/admin/iskraAdviceOutcomeCore.js'
import { normalizeLearningEvent, applyLearningEventToSignalRow } from '../src/lib/admin/iskraLearningCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const snapshot = {
  club_name: 'Тест',
  period: { year: 2026, month: 7, label: 'июль 2026' },
  sales: { plan_total: 1000000, profit_total: 400000, plan_progress_pct: 40 },
  insights: { plan: { pct: 40, calendar_expected_pct: 55, calendar_vs_plan: 'behind' } },
  club_finance: { available: true, forecast: { shortfall_rub: 120000 } },
}

const baseline = captureAdviceBaseline('plan_behind_calendar', snapshot, { source: 'test' })
ok(baseline?.card_id === 'plan_behind_calendar', 'capture baseline')
ok(baseline.plan_pct === 40, 'baseline plan pct')

const note = encodeAdviceBaselineNote(baseline)
ok(note.startsWith('[baseline]'), 'encode baseline note')
ok(parseAdviceBaselineNote(note)?.card_id === 'plan_behind_calendar', 'parse baseline note')

const later = {
  ...snapshot,
  sales: { ...snapshot.sales, profit_total: 520000, plan_progress_pct: 52 },
  insights: { plan: { pct: 52, calendar_expected_pct: 60, calendar_vs_plan: 'behind' } },
}
const outcome = settleAdviceOutcome(baseline, later, { reason: 'test' })
ok(outcome?.plan_delta_pct === 12, 'plan delta')
ok(outcome.profit_delta_rub === 120000, 'profit delta')
ok(String(outcome.label_ru).includes('+12'), 'outcome label')

const ev = adviceOutcomeToLearningEvent(outcome, { clubId: 'c1' })
ok(ev?.event_type === 'advice_outcome', 'outcome learning event')
const norm = normalizeLearningEvent(ev)
ok(norm.ok, 'normalize advice_outcome')
const row = applyLearningEventToSignalRow(null, norm.event)
ok(row.playbook_note.startsWith('[outcome]'), 'outcome note on row')

const baseEv = adviceBaselineToLearningEvent(baseline, { clubId: 'c1' })
const baseNorm = normalizeLearningEvent(baseEv)
const baseRow = applyLearningEventToSignalRow(null, baseNorm.event)
const settled = settleOpenAdviceBaselines([baseRow], later)
ok(settled.length === 1, 'settle open baselines')
ok(buildAdviceOutcomeSparkLine(settled), 'spark line from outcomes')
ok(buildAdviceOutcomesPromptBlock(settled).includes('ИСХОДЫ СОВЕТОВ'), 'prompt block')

if (failed) process.exit(1)
console.log('verify-iskra-advice-outcome: all passed')
