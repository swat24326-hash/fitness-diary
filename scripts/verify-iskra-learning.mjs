/**
 * node scripts/verify-iskra-learning.mjs
 */
import {
  ISKRA_LEARNING_PHASE,
  aggregateLearningSignals,
  applyLearningEventToSignalRow,
  buildLearnedPromptAppend,
  buildLearningBundleFromRows,
  buildLearningSignalKey,
  deriveReplySignalKey,
  extractLearningPlaybooks,
  normalizeLearningEvent,
  rankProactiveHintsByLearning,
  shouldPromoteToPlaybook,
} from '../src/lib/admin/iskraLearningCore.js'
import {
  buildIskraLearningContext,
  buildLearningMetaForResponse,
  mergeLearningIntoPromptAppend,
  rankHintsWithLearning,
} from '../src/lib/admin/iskraLearningPipeline.js'
import { buildIskraProactiveHints } from '../src/lib/admin/iskraProactiveHints.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(buildLearningSignalKey('hint', 'plan_behind') === 'hint:plan_behind', 'signal key hint')
ok(buildLearningSignalKey('chip', 'advice') === 'chip:advice', 'signal key chip')

const replyKey = deriveReplySignalKey('Как выполнен план продаж?', { chip_id: 'plan' })
ok(replyKey === 'chip:plan', 'derive reply key from chip')

const bad = normalizeLearningEvent({ event_type: 'nope' })
ok(!bad.ok, 'reject unknown event')

const ev = normalizeLearningEvent({
  club_id: 'club-1',
  event_type: 'feedback_up',
  signal_key: 'chip:advice',
})
ok(ev.ok && ev.event.club_id === 'club-1', 'normalize feedback_up')

const events = [
  { club_id: 'c1', event_type: 'feedback_up', signal_key: 'hint:advice' },
  { club_id: 'c1', event_type: 'feedback_up', signal_key: 'hint:advice' },
  { club_id: 'c1', event_type: 'feedback_down', signal_key: 'hint:risks' },
  { club_id: 'c1', event_type: 'hint_click', signal_key: 'hint:plan_behind' },
]
const agg = aggregateLearningSignals(events)
ok(agg.find((s) => s.signal_key === 'hint:advice')?.positive_count === 2, 'aggregate positive')
ok(agg.find((s) => s.signal_key === 'hint:plan_behind')?.engagement_count === 1, 'aggregate engagement')

const promotable = {
  signal_key: 'chip:plan',
  positive_count: 4,
  negative_count: 0,
  engagement_count: 2,
  score: 3,
  playbook_confirmed: false,
}
ok(shouldPromoteToPlaybook(promotable), 'auto promote playbook')
ok(!shouldPromoteToPlaybook({ ...promotable, positive_count: 1 }), 'no promote with few positives')

const playbooks = extractLearningPlaybooks([promotable])
ok(playbooks.length === 1, 'extract playbooks')

const bundle = buildLearningBundleFromRows([
  {
    signal_key: 'chip:plan',
    positive_count: 4,
    negative_count: 0,
    engagement_count: 1,
    score: 3,
    playbook_confirmed: true,
    playbook_note: 'В этом клубе сначала смотрят план по направлениям.',
  },
])
ok(bundle.playbooks.length >= 1, 'bundle from rows')

const append = buildLearnedPromptAppend(bundle)
ok(append.includes('УРОКИ КЛУБА'), 'learned prompt append')
ok(append.includes('направлениям'), 'playbook note in append')

const learningCtx = buildIskraLearningContext({ learningBundle: bundle })
const merged = mergeLearningIntoPromptAppend('Базовый промпт', learningCtx)
ok(merged.includes('Базовый промпт') && merged.includes('УРОКИ КЛУБА'), 'merge learning into prompt')

const meta = buildLearningMetaForResponse(learningCtx)
ok(meta.learning_playbooks >= 1, 'learning meta')

const hints = buildIskraProactiveHints({ plan_progress_pct: 30, report_days: 0 })
const ranked = rankProactiveHintsByLearning(hints, [
  { signal_key: 'hint:risks', score: 5 },
  { signal_key: 'hint:plan_behind', score: 1 },
])
ok(ranked[0]?.id === 'risks' || ranked[0]?.id === 'plan_behind', 'rank hints by score')
ok(rankHintsWithLearning(hints, learningCtx).length === hints.length, 'pipeline rank hints')

const row = applyLearningEventToSignalRow(null, ev.event)
ok(row.positive_count === 1 && row.score > 0, 'apply event to empty row')

ok(ISKRA_LEARNING_PHASE === 'apply' || ISKRA_LEARNING_PHASE === 'collect', 'learning phase set')

if (failed) process.exit(1)
console.log('verify-iskra-learning: all passed')
