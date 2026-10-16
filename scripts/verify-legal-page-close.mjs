/**
 * Закрытие legal-страниц: возврат по state со всех входов, не слепой history.back.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  isSafeLegalReturnTo,
  legalLinkNavState,
  legalPageCloseAction,
  resolveLegalClose,
} from '../src/lib/legal/legalPageCloseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

console.log('resolveLegalClose')
const fromTrainer = resolveLegalClose({
  state: legalLinkNavState({ pathname: '/trainer', fromProfile: true }),
  hasOpener: false,
})
ok(fromTrainer.action === 'return' && fromTrainer.to === '/trainer', 'из профиля тренера → /trainer')
ok(fromTrainer.reopenMyProfile === true, 'снова открыть «Мой профиль»')

ok(
  resolveLegalClose({
    state: legalLinkNavState({ pathname: '/club', fromProfile: false }),
  }).to === '/club',
  'с оферты gate → /club (снова gate)',
)

ok(
  resolveLegalClose({
    state: legalLinkNavState({ pathname: '/coach/more', fromProfile: true }),
  }).to === '/coach/more',
  'из /coach/more → туда же',
)

ok(
  resolveLegalClose({
    state: legalLinkNavState({ pathname: '/me/settings', fromProfile: true }),
  }).to === '/me/settings',
  'из /me/settings → туда же',
)

ok(
  resolveLegalClose({
    state: legalLinkNavState({ pathname: '/login', fromProfile: false }),
  }).to === '/login',
  'со входа → /login',
)

ok(resolveLegalClose({ state: null, hasOpener: true }).action === 'close', 'вкладка с opener — закрыть')
ok(resolveLegalClose({ state: null, hasOpener: false }).action === 'home', 'прямой заход → /')
ok(resolveLegalClose({ state: null, hasOpener: false }).to === '/', 'fallback путь /')
ok(!isSafeLegalReturnTo('https://evil') && !isSafeLegalReturnTo('//evil'), 'чужие URL отсекаем')
ok(legalPageCloseAction({ historyLength: 1, hasOpener: false }) === 'login', 'legacy без истории')

console.log('входы — state / без target=_blank на оферту')
const entries = [
  ['src/pages/Login.jsx', 'LegalEntryLinks', 'вход сотрудников'],
  ['src/pages/coach/CoachSignInPage.jsx', 'LegalEntryLinks', 'вход /coach'],
  ['src/pages/client/ClientMePage.jsx', 'LegalEntryLinks', 'вход /me'],
  ['src/pages/client/ClientSettingsSection.jsx', 'legal-entry-links--in-profile', 'профиль клиента'],
  ['src/components/header/HeaderProfileSettings.jsx', 'legal-entry-links--in-profile', 'профиль сотрудника'],
  ['src/pages/coach/CoachMorePage.jsx', 'legal-entry-links--in-profile', 'профиль /coach More'],
  ['src/components/legal/SupervisorOfferGate.jsx', 'OfferLink', 'gate оферты'],
]
for (const [file, needle, label] of entries) {
  ok(src(file).includes(needle), label)
}

ok(!/target="_blank"/.test(src('src/components/legal/SupervisorOfferGate.jsx')), 'gate: оферта в той же вкладке')
ok(/OfferLink/.test(src('src/components/legal/SupervisorOfferGate.jsx')), 'gate: OfferLink со state')
ok(/legalLinkNavState/.test(src('src/components/legal/OfferLink.jsx')), 'OfferLink пишет return state')
ok(/legalLinkNavState/.test(src('src/components/legal/PrivacyPolicyLink.jsx')), 'PrivacyPolicyLink пишет state')
ok(/legalLinkNavState/.test(src('src/components/legal/ChatRulesLink.jsx')), 'ChatRulesLink пишет state')

console.log('страницы и возврат в профиль')
for (const page of ['PrivacyPolicyPage', 'ChatRulesPage', 'OfferPage']) {
  const t = src(`src/pages/legal/${page}.jsx`)
  ok(/LegalPageShell/.test(t), `${page}: оболочка`)
  ok(/LegalCrossLink/.test(t), `${page}: cross-link сохраняет state`)
  ok(!/Ко входу сотрудников/.test(t), `${page}: без аэропорта`)
}
ok(/resolveLegalClose/.test(src('src/components/legal/LegalPageShell.jsx')), 'shell: resolveLegalClose')
ok(/consumeReopenMyProfileState/.test(src('src/components/AppHeader.jsx')), 'шапка: reopen профиль')
ok(/consumeReopenMyProfileState/.test(src('src/components/profile/ProfileMenuUser.jsx')), 'меню phone: reopen')

if (failed) {
  console.error(`\nverify-legal-page-close: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-legal-page-close: ok')
