/**
 * Применимость docs/CODE_TRACE.md: пути, символы, verify, связки INCIDENTS.
 * node scripts/verify-code-trace.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const docPath = join(root, 'docs/CODE_TRACE.md')
const incidentsPath = join(root, 'docs/INCIDENTS.md')

let failed = 0

function ok(msg) {
  console.log('ok:', msg)
}

function fail(msg) {
  console.error('FAIL:', msg)
  failed++
}

function assert(cond, msg) {
  if (cond) ok(msg)
  else fail(msg)
}

const doc = readFileSync(docPath, 'utf8')

/** @type {Set<string>} */
const paths = new Set()

for (const m of doc.matchAll(/`((?:src|api|scripts|supabase|vite\.config\.js)[^`]+)`/g)) {
  let p = m[1].split(' ')[0].replace(/\([^)]*\)/g, '').trim()
  if (p.endsWith('/')) continue
  if (p.includes('→') || p.includes('*') || p.includes('…')) continue
  paths.add(p)
}
paths.add('src/lib/pnk/')
paths.add('supabase/migrations/')

console.log(`\n=== CODE_TRACE paths (${paths.size}) ===`)
for (const p of [...paths].sort()) {
  const abs = join(root, p)
  if (p.endsWith('/')) {
    assert(existsSync(abs) && statSync(abs).isDirectory(), `dir exists: ${p}`)
    continue
  }
  assert(existsSync(abs), `file exists: ${p}`)
}

/** @type {{ file: string, symbol: string }[]} */
const SYMBOLS = [
  { file: 'src/lib/syncService.js', symbol: 'saveLocalWithSync' },
  { file: 'src/lib/localDb.js', symbol: 'putStoreUnlessPendingSync' },
  { file: 'src/lib/syncPullGuardCore.js', symbol: 'cloudPutAllowedOnPull' },
  { file: 'src/lib/syncFlushResult.js', symbol: 'shouldPreserveLocalRowOnPull' },
  { file: 'src/lib/trainingDraftTabSwitchCore.js', symbol: 'export' },
  { file: 'src/lib/trainer/trainingMembershipDebitCore.js', symbol: 'export' },
  { file: 'src/lib/clientTrainingsEnsure.js', symbol: 'export' },
  { file: 'src/lib/membershipRules.js', symbol: 'export' },
  { file: 'api/_lib/mutationAuth.js', symbol: 'export' },
  { file: 'src/lib/clubContext.js', symbol: 'export' },
]

console.log('\n=== KEY symbols ===')
for (const { file, symbol } of SYMBOLS) {
  const text = readFileSync(join(root, file), 'utf8')
  assert(text.includes(symbol), `${file} contains ${symbol}`)
}

const VERIFY_SCRIPTS = [
  'scripts/verify-training-draft-tab-switch.mjs',
  'scripts/verify-training-draft-page-epoch.mjs',
  'scripts/verify-training-draft-restore.mjs',
  'scripts/verify-training-draft-durable.mjs',
  'scripts/verify-training-membership-debit.mjs',
  'scripts/verify-training-persist-status.mjs',
  'scripts/verify-membership-used-reconcile.mjs',
  'scripts/verify-sync-offline.mjs',
  'scripts/verify-sync-unsynced.mjs',
  'scripts/verify-sync-pull-merge.mjs',
  'scripts/verify-client-trainings-prune.mjs',
  'scripts/verify-critical-hall.mjs',
  'scripts/verify-app-stability.mjs',
  'scripts/verify-auth-sign-in-fallback.mjs',
  'scripts/verify-auth-sign-in-fast-path.mjs',
  'scripts/verify-auth-session-recover.mjs',
  'scripts/verify-training-set-laterality.mjs',
  'scripts/verify-exercise-format.mjs',
  'scripts/verify-membership-total-guard.mjs',
  'scripts/verify-training-membership-link.mjs',
  'scripts/verify-stats-agg-parity.mjs',
  'scripts/verify-club-client-period.mjs',
  'scripts/verify-membership-type-stats.mjs',
  'scripts/verify-security-l1-audit.mjs',
  'scripts/verify-club-finance-forecast.mjs',
  'scripts/verify-sales-plan-matrix-compare.mjs',
  'scripts/verify-pz-trainings-report-import.mjs',
  'scripts/verify-sales-call-today.mjs',
]

console.log('\n=== VERIFY scripts from CODE_TRACE ===')
for (const s of VERIFY_SCRIPTS) {
  assert(existsSync(join(root, s)), `verify script: ${s}`)
}

const incidents = readFileSync(incidentsPath, 'utf8')
const codes = 'ABCDEFGHIJKLMNOPQRSTUVW'.slice(0, 17).split('') // A–Q
console.log('\n=== INCIDENTS → CODE_TRACE links ===')
for (const code of codes) {
  const re = new RegExp(`\\*\\*${code}\\*\\*[^\\n]+CODE_TRACE`)
  assert(re.test(incidents), `INCIDENTS code ${code} links CODE_TRACE`)
}

const playbook = readFileSync(join(root, 'docs/AGENT_PLAYBOOK.md'), 'utf8')
assert(playbook.includes('CODE_TRACE.md'), 'AGENT_PLAYBOOK references CODE_TRACE')

// Нет «голых» verify-имён без scripts/ в таблицах путей (кроме wildcard строк)
const bareVerify = doc.match(/\|[^|\n]*\|[^|\n]*verify-[a-z0-9-]+\.mjs[^/][^|\n]*\|/gi) || []
const badBare = bareVerify.filter((line) => !line.includes('scripts/verify-'))
assert(badBare.length === 0, `verify paths use scripts/ prefix (${badBare.length} bare)`)

console.log('\n=== Run CODE_TRACE verify scripts ===')
for (const s of VERIFY_SCRIPTS) {
  const label = s.replace('scripts/', '')
  const r = spawnSync('node', [s], { cwd: root, stdio: 'pipe', encoding: 'utf8' })
  if (r.status !== 0) {
    fail(`run ${label}: exit ${r.status}`)
    if (r.stderr) console.error(r.stderr.slice(0, 500))
    if (r.stdout) console.error(r.stdout.slice(0, 500))
  } else {
    ok(`run ${label}`)
  }
}

console.log('\n=== verify-code-trace summary ===')
if (failed) {
  console.error(`FAIL: ${failed} check(s)`)
  process.exit(1)
}
console.log('PASS: CODE_TRACE applicable')
