/**
 * node scripts/verify-iskra-month-memory.mjs
 */
import { buildGeminiSnapshot } from '../src/lib/admin/geminiAnalyticsSnapshot.js'
import { applyMonthComparisonInsights } from '../src/lib/admin/clubMonthAnalyticsCore.js'
import { buildMonthMemoryBlock, shouldLoadPreviousMonthSnapshot } from '../src/lib/admin/iskraMonthMemoryCore.js'
import { augmentPromptDataBlockForAdmin } from '../src/lib/admin/iskraAdminPromptContext.js'
import { buildPlaybooksPromptBlock } from '../src/lib/admin/iskraLearningCore.js'
import { compactOpenDispatchForPrompt } from '../src/lib/admin/iskraDispatchCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(shouldLoadPreviousMonthSnapshot({ comparePrevious: true }), 'load prev on compare')
ok(shouldLoadPreviousMonthSnapshot({ responseMode: 'deep' }), 'load prev on deep')
ok(!shouldLoadPreviousMonthSnapshot({ responseMode: 'brief' }), 'skip prev on brief')

const cur = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 6,
  monthRows: [{ report_date: '2026-06-10', profit_nk: 1000, profit_dk: 2000, trainings_count: 5 }],
  plan: { plan_total: 10000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 10000 },
  includeFinance: false,
})
const prev = buildGeminiSnapshot({
  clubName: 'Север',
  year: 2026,
  month: 5,
  monthRows: [{ report_date: '2026-05-10', profit_nk: 800, profit_dk: 1000, trainings_count: 4 }],
  plan: { plan_total: 9000, plan_level_1: 3000, plan_level_2: 6000, plan_level_3: 9000 },
  includeFinance: false,
})
applyMonthComparisonInsights(cur, prev)

const memory = buildMonthMemoryBlock(cur, prev)
ok(memory?.source === 'mom_comparison', 'month memory mom')
ok(memory?.profit_current != null, 'month memory profit')

const augmented = augmentPromptDataBlockForAdmin(
  { analysis_period: 'июнь 2026' },
  cur,
  {
    responseMode: 'standard',
    previousSnapshot: prev,
    playbooks: [{ signal_key: 'chip:plan', note: 'Сначала план' }],
    dispatchOpen: compactOpenDispatchForPrompt([
      { id: '1', kind: 'task', status: 'pending', title: 'ПЗ', recipient_user_id: 'u1', priority: 'high' },
    ]),
  },
)
ok(augmented.month_memory, 'augment month_memory')
ok(augmented.club_playbooks?.length === 1, 'augment playbooks')
ok(augmented.open_dispatch_tasks?.length === 1, 'augment dispatch')

const playbooks = buildPlaybooksPromptBlock({
  playbooks: [{ signal_key: 'a', note: 'b' }],
  phase: 'apply',
})
ok(playbooks?.length === 1, 'playbooks prompt block')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-month-memory: all checks passed')
