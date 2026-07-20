/**
 * node scripts/verify-iskra-inaction.mjs
 */
import {
  ISKRA_INACTION_DISMISS_THRESHOLD,
  buildInactionDismissEvent,
  buildInactionPromptAppend,
  buildInactionSignalKey,
  extractInactionLessons,
  shouldPromoteInactionLesson,
} from '../src/lib/admin/iskraInactionLearningCore.js'
import { normalizeLearningEvent, applyLearningEventToSignalRow } from '../src/lib/admin/iskraLearningCore.js'
import { buildPastSelfComparison } from '../src/lib/admin/iskraPastSelfCore.js'
import {
  estimateIskraModelCeiling,
  buildModelCeilingPromptRule,
  buildProductGapAskRuleWithCeiling,
} from '../src/lib/admin/iskraModelCeilingCore.js'
import { buildCoachQualityPromptBlock, buildCoachQualityAlert } from '../src/lib/admin/iskraCoachQualityPromptCore.js'
import { buildIskraDataAvailability } from '../src/lib/admin/iskraDataAvailability.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ISKRA_INACTION_DISMISS_THRESHOLD === 3, 'dismiss threshold')
ok(buildInactionSignalKey('spark_brief', 'x').startsWith('inaction:'), 'inaction signal key')

const raw = buildInactionDismissEvent({
  clubId: 'c1',
  kind: 'spark_brief',
  targetId: 'plan',
})
ok(raw?.event_type === 'inaction_dismiss', 'dismiss event')
const norm = normalizeLearningEvent(raw)
ok(norm.ok, 'normalize inaction')
let row = null
for (let i = 0; i < 3; i += 1) {
  row = applyLearningEventToSignalRow(row, norm.event)
}
ok(shouldPromoteInactionLesson(row), 'promote after 3 dismiss')
const lessons = extractInactionLessons([row])
ok(lessons.length === 1, 'extract inaction lessons')
ok(buildInactionPromptAppend(lessons).includes('НЕДЕЛАНИЕ'), 'inaction prompt')

const past = buildPastSelfComparison({
  insights: {
    mom_comparison: {
      previous_period_label: 'июнь',
      profit_direction: 'up',
      profit_delta_pct: 12,
      profit_current: 500000,
      plan_delta_pct: 3,
    },
  },
  sales: { profit_total: 500000, plan_progress_pct: 50 },
})
ok(past?.line.includes('прошлый вы') || past?.line.includes('июнь'), 'past self line')

const avail = buildIskraDataAvailability({
  sales: { plan_total: 0, days_with_reports: 0 },
  insights: {},
})
const ceiling = estimateIskraModelCeiling(avail, { confidence: 'low' })
ok(ceiling.band === 'low' || ceiling.score < 75, 'ceiling low when gaps')
ok(buildModelCeilingPromptRule(ceiling).includes('ПОТОЛОК'), 'ceiling prompt')
ok(buildProductGapAskRuleWithCeiling().includes('ПРОБЕЛЫ'), 'gap rule with ceiling')

const cqBlock = buildCoachQualityPromptBlock(null)
ok(cqBlock.includes('Качество ведения'), 'cq default prompt')
const cqAlert = buildCoachQualityAlert({ reviewCount: 2, lines: ['2 на разбор'], chipLabel: '2 на разбор' })
ok(cqAlert?.id === 'coach_quality', 'cq alert')

if (failed) process.exit(1)
console.log('verify-iskra-inaction: all passed')
