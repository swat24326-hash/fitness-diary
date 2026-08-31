/**
 * Критический контур зала + админки (быстрее полного qa:local).
 * План: docs/CRITICAL_SCENARIOS_QA.md
 *
 * node scripts/qa-critical.mjs [--skip-lint] [--with-build]
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const skipLint = process.argv.includes('--skip-lint')
const withBuild = process.argv.includes('--with-build')

let failed = 0

function run(label, cmd, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root })
  if (r.status !== 0) {
    console.error(`✗ ${label}`)
    failed += 1
    return false
  }
  console.log(`✓ ${label}`)
  return true
}

/** @type {{ id: string, label: string, script: string }[]} */
const BLOCKS = [
  // A1 — тренировка / абон
  { id: 'A1a', label: 'training persist status', script: 'scripts/verify-training-persist-status.mjs' },
  { id: 'A1b', label: 'training membership debit', script: 'scripts/verify-training-membership-debit.mjs' },
  { id: 'A1c', label: 'critical hall stitch', script: 'scripts/verify-critical-hall.mjs' },
  // A2 — Sync
  { id: 'A2a', label: 'sync offline-first', script: 'scripts/verify-sync-offline.mjs' },
  { id: 'A2b', label: 'sync pull merge', script: 'scripts/verify-sync-pull-merge.mjs' },
  { id: 'A2c', label: 'client trainings orphan prune', script: 'scripts/verify-client-trainings-prune.mjs' },
  { id: 'A2d', label: 'training draft delete', script: 'scripts/verify-training-draft-delete.mjs' },
  { id: 'A2e', label: 'training draft tab switch', script: 'scripts/verify-training-draft-tab-switch.mjs' },
  // A3 — security
  { id: 'A3', label: 'security L1 audit', script: 'scripts/verify-security-l1-audit.mjs' },
  // A4 — даты МСК
  { id: 'A4', label: 'date ru / MSK', script: 'scripts/verify-date-ru.mjs' },
  // A5 — главная
  { id: 'A5a', label: 'admin club day summary', script: 'scripts/verify-admin-club-day-summary.mjs' },
  { id: 'A5b', label: 'club call shift summary', script: 'scripts/verify-club-call-shift-summary.mjs' },
  { id: 'A5c', label: 'admin home glance timeout', script: 'scripts/verify-admin-home-glance-timeout.mjs' },
  // A6 — call / SMS
  { id: 'A6a', label: 'club call funnel chips', script: 'scripts/verify-club-call-funnel-chips.mjs' },
  { id: 'A6b', label: 'club outreach stats', script: 'scripts/verify-club-outreach-stats.mjs' },
  // A7 — клиенты / залы
  { id: 'A7a', label: 'client hall lifecycle', script: 'scripts/verify-client-hall-lifecycle.mjs' },
  { id: 'A7b', label: 'admin clients list lifecycle', script: 'scripts/verify-admin-clients-list-lifecycle.mjs' },
  { id: 'A7c', label: 'admin clients cross-hall search', script: 'scripts/verify-admin-clients-cross-hall-search.mjs' },
]

console.log('qa-critical — контур из docs/CRITICAL_SCENARIOS_QA.md')
console.log(`блоков verify: ${BLOCKS.length}`)

if (withBuild) {
  run('build', 'npm', ['run', 'build'])
}

for (const b of BLOCKS) {
  run(`${b.id} ${b.label}`, 'node', [b.script])
}

if (!skipLint) {
  run('A9 lint', 'npm', ['run', 'lint'])
}

console.log('\n=== qa-critical summary ===')
if (failed) {
  console.error(`FAIL: ${failed} step(s). См. docs/CRITICAL_SCENARIOS_QA.md`)
  process.exit(1)
}
console.log('PASS: critical scenarios green')
console.log('Ручной чеклист (§3): docs/CRITICAL_SCENARIOS_QA.md')
