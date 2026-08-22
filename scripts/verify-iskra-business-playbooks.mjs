/**
 * node scripts/verify-iskra-business-playbooks.mjs
 */
import { buildPlanDirectionInsights } from '../src/lib/admin/geminiPlanDirections.js'
import {
  ISKRA_SEED_PLAYBOOKS,
  mergePlaybooksForPrompt,
  pickPrimarySeedPlaybook,
  pickSeedPlaybooksForSnapshot,
  resolveRelevantSeedTopics,
  seedPlaybookActionLine,
} from '../src/lib/admin/iskraBusinessPlaybooksCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ISKRA_SEED_PLAYBOOKS.length >= 10, 'seed count')
ok(ISKRA_SEED_PLAYBOOKS.some((p) => p.note.includes('НК')), 'NK in seed')
ok(ISKRA_SEED_PLAYBOOKS.some((p) => p.note.includes('ПЗ')), 'PZ in seed')

const snap = {
  club_name: 'Север',
  sales: {
    plan_progress_pct: 38,
    profit_total: 800000,
    pz_trainings_from_manager_reports: 120,
    structure_shares: { nk: 28, dk: 22 },
  },
  insights: {
    plan: { pct: 38, calendar_vs_plan: 'behind', tone: 'weak' },
    direction_plan: buildPlanDirectionInsights([
      { key: 'pz', label: 'ПЗ', planTarget: 100, planProgressPercent: 32, amount: 10 },
      { key: 'tz', label: 'ТЗ', planTarget: 80, planProgressPercent: 70, amount: 8 },
    ]),
    structure: { weak_nk_vs_dk: true, nk_share_pct: 28 },
  },
  trainer_contour: { club_roll_up: { inactive_clients_holders: 6 } },
}

const topics = resolveRelevantSeedTopics(snap)
ok(topics.includes('plan'), 'topic plan')
ok(topics.includes('pz'), 'topic pz')

const picks = pickSeedPlaybooksForSnapshot(snap, { limit: 3 })
ok(picks.length >= 2, 'picks for lagging snapshot')
ok(picks[0].note.includes('ПЗ') || picks[0].topic === 'plan', 'primary relevant')

const primary = pickPrimarySeedPlaybook(snap)
ok(primary?.note, 'primary seed')
ok(seedPlaybookActionLine(primary).length > 10, 'action line')

const merged = mergePlaybooksForPrompt({
  clubPlaybooks: [{ signal_key: 'club:custom', note: 'Наш клуб: усилить ДК в пятницу' }],
  snapshot: snap,
  limit: 5,
})
ok(merged.some((p) => p.signal_key === 'club:custom'), 'club playbook kept')
ok(merged.length >= 2, 'merged with seed')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-business-playbooks: all checks passed')
