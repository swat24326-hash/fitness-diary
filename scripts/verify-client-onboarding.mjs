/**
 * /me: баннеры первого входа — установить приложение, включить напоминания; «Позже» до 3 раз.
 * node scripts/verify-client-onboarding.mjs
 */
import {
  ONBOARDING_LATER_MAX,
  applyOnboardingOutcome,
  freshOnboardingState,
  pendingOnboardingSteps,
  readOnboardingState,
} from '../src/lib/client/clientOnboardingCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const fresh = freshOnboardingState()
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const android = { installMode: 'prompt', pushMode: 'off' }

ok(same(pendingOnboardingSteps(null, android), []), 'без входа по ссылке баннеров нет')
ok(same(pendingOnboardingSteps(fresh, android), ['install', 'push']), 'Android после QR: установить, потом напоминания')
ok(same(pendingOnboardingSteps(fresh, { installMode: 'ios', pushMode: 'install_first' }), ['install']), 'iPhone в Safari: только установка')
ok(same(pendingOnboardingSteps(fresh, { installMode: 'none', pushMode: 'off' }), ['push']), 'iPhone со значка: сразу напоминания')
ok(same(pendingOnboardingSteps(fresh, { installMode: 'none', pushMode: 'on' }), []), 'всё уже сделано — молчим')
ok(same(pendingOnboardingSteps(fresh, { installMode: 'none', pushMode: 'denied' }), []), 'уведомления запрещены — не навязываем')
ok(same(pendingOnboardingSteps(fresh, { installMode: 'none', pushMode: 'none' }), []), 'push не настроен — молчим')

const installed = applyOnboardingOutcome(fresh, 'install', 'done')
ok(same(pendingOnboardingSteps(installed, android), ['push']), 'установил — дальше напоминания')
ok(same(pendingOnboardingSteps(fresh, { ...android, snoozed: ['install'] }), ['push']), '«Позже» прячет шаг до следующего захода')

let s = fresh
for (let i = 0; i < ONBOARDING_LATER_MAX - 1; i += 1) s = applyOnboardingOutcome(s, 'install', 'later')
ok(pendingOnboardingSteps(s, android)[0] === 'install', `«Позже» ${ONBOARDING_LATER_MAX - 1} раза — ещё покажем`)
s = applyOnboardingOutcome(s, 'install', 'later')
ok(same(pendingOnboardingSteps(s, android), ['push']), `«Позже» ${ONBOARDING_LATER_MAX} раза — больше не показываем`)

ok(readOnboardingState(null) === null && readOnboardingState({ install_done: true }) === null, 'мусор в хранилище — как без баннеров')
ok(readOnboardingState({ started: true, push_later: '2' })?.push_later === 2, 'счётчик читается числом')

if (failed) {
  console.error(`\nverify-client-onboarding: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-onboarding: OK')
