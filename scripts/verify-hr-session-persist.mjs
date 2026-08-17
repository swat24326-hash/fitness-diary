/**
 * Снимок пульса при complete (node scripts/verify-hr-session-persist.mjs).
 */
import { pickHrSessionForPersist, hrScopeAllowsRecording } from '../src/lib/hr/hrSessionPersistCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(!hrScopeAllowsRecording(''), 'empty scope does not record')
ok(!hrScopeAllowsRecording(null), 'null scope does not record')
ok(hrScopeAllowsRecording('tid-1'), 'bound scope records')

const live = { avg: 140, min: 110, max: 170, samples_n: 12, duration_sec: 600 }
const stored = { avg: 120, min: 100, max: 150, samples_n: 8, duration_sec: 400 }

const first = pickHrSessionForPersist({ firstCompletion: true, liveSummary: live, storedSnapshot: stored })
ok(first && first.avg === 140, 'first complete prefers live')

const firstStoredOnly = pickHrSessionForPersist({
  firstCompletion: true,
  liveSummary: null,
  storedSnapshot: stored,
})
ok(firstStoredOnly && firstStoredOnly.avg === 120, 'first complete falls back to stored')

const edit = pickHrSessionForPersist({ firstCompletion: false, liveSummary: live, storedSnapshot: stored })
ok(edit && edit.avg === 120, 'edit completed keeps diary snapshot')

const editEmptyLive = pickHrSessionForPersist({
  firstCompletion: false,
  liveSummary: live,
  storedSnapshot: null,
})
ok(editEmptyLive == null, 'edit completed does not invent live pulse')

ok(
  pickHrSessionForPersist({ firstCompletion: true, liveSummary: null, storedSnapshot: null }) == null,
  'no pulse if never connected',
)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll hr-session-persist checks passed')
