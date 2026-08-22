/**
 * Auth-first вход и сообщение при недоступном Supabase.
 * node scripts/verify-auth-sign-in-fast-path.mjs
 */
import {
  SUPABASE_CLOUD_UNAVAILABLE_RU,
  buildDirectAuthEmailCandidates,
  isInvalidCredentialsMessage,
  isSupabaseTransportMessage,
} from '../src/lib/authSignInCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(buildDirectAuthEmailCandidates('Ivanov').join() === 'ivanov@trainer.local', 'synth candidate')
ok(buildDirectAuthEmailCandidates('a@b.ru').join() === 'a@b.ru', 'email candidate')
ok(isInvalidCredentialsMessage('Invalid login credentials'), 'invalid creds en')
ok(!isInvalidCredentialsMessage('timeout'), 'timeout not invalid creds')
ok(isSupabaseTransportMessage('timeout'), 'timeout is transport')
ok(
  /баз|облак/i.test(SUPABASE_CLOUD_UNAVAILABLE_RU) && !/status\.supabase\.com/i.test(SUPABASE_CLOUD_UNAVAILABLE_RU),
  'cloud unavailable portable (no status.supabase.com)',
)

if (failed) process.exit(1)
console.log('verify-auth-sign-in-fast-path: all passed')
