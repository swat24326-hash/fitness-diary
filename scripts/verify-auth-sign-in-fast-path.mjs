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

ok(
  buildDirectAuthEmailCandidates('Ivanov').join() ===
    'ivanov@trainer.local,ivanov@sales.local,ivanov@club.local',
  'synth candidates trainer+sales+club',
)
ok(buildDirectAuthEmailCandidates('Sales').includes('sales@sales.local'), 'sales login candidate')
ok(
  buildDirectAuthEmailCandidates('a@b.ru').join() ===
    'a@b.ru,a@b.ru@club.local,a@b.ru@trainer.local,a@b.ru@sales.local',
  'email-like login also tries synth domains (supervisor login=email)',
)
ok(
  buildDirectAuthEmailCandidates('maslofa14.04.89@mail.ru').includes(
    'maslofa14.04.89@mail.ru@club.local',
  ),
  'club.local candidate for supervisor-style login',
)
ok(isInvalidCredentialsMessage('Invalid login credentials'), 'invalid creds en')
ok(!isInvalidCredentialsMessage('timeout'), 'timeout not invalid creds')
ok(isSupabaseTransportMessage('timeout'), 'timeout is transport')
ok(
  /баз|облак/i.test(SUPABASE_CLOUD_UNAVAILABLE_RU) && !/status\.supabase\.com/i.test(SUPABASE_CLOUD_UNAVAILABLE_RU),
  'cloud unavailable portable (no status.supabase.com)',
)

if (failed) process.exit(1)
console.log('verify-auth-sign-in-fast-path: all passed')
