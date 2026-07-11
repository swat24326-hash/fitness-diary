/**
 * node scripts/verify-auth-login-resolve.mjs
 */
import {
  emailFromLoginRow,
  loginLookupEmails,
  normalizeLoginInput,
  trainerLocalEmail,
} from '../src/lib/authLoginResolveCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(normalizeLoginInput('  ivan  ') === 'ivan', 'trim spaces')
ok(normalizeLoginInput('ivan\u00a0petrov') === 'ivan petrov', 'nbsp')
ok(normalizeLoginInput('login\u200bname') === 'loginname', 'zero-width')

ok(trainerLocalEmail('Ivanov') === 'ivanov@trainer.local', 'trainer local email')
ok(trainerLocalEmail('a@b.ru') === '', 'email-like skips synth')

ok(
  emailFromLoginRow({ email: '  a@b.ru ', is_active: true }, 'x')?.email === 'a@b.ru',
  'row email trimmed',
)
ok(
  emailFromLoginRow({ email: null, is_active: true }, 'Petrov')?.email === 'petrov@trainer.local',
  'synth from login when email empty',
)
ok(emailFromLoginRow({ email: null, is_active: false }, 'x')?.isActive === false, 'inactive row')

ok(loginLookupEmails('trainer1').join() === 'trainer1@trainer.local', 'lookup emails synth')
ok(loginLookupEmails('a@b.ru').join() === 'a@b.ru', 'lookup emails direct')

if (failed) process.exit(1)
console.log('verify-auth-login-resolve: all passed')
