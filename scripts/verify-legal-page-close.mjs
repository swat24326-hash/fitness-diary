/**
 * Закрытие legal-страниц: назад / закрыть вкладку / вход.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { legalPageCloseAction } from '../src/lib/legal/legalPageCloseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

ok(legalPageCloseAction({ historyLength: 2, hasOpener: false }) === 'back', 'есть история — назад')
ok(legalPageCloseAction({ historyLength: 1, hasOpener: true }) === 'close', 'вкладка из gate — закрыть')
ok(legalPageCloseAction({ historyLength: 1, hasOpener: false }) === 'login', 'прямой заход — на вход')
ok(legalPageCloseAction({ historyLength: 0, hasOpener: false }) === 'login', 'пустая история — на вход')

for (const page of ['PrivacyPolicyPage', 'ChatRulesPage', 'OfferPage']) {
  const t = src(`src/pages/legal/${page}.jsx`)
  ok(/LegalPageShell/.test(t), `${page}: оболочка с крестиком`)
  ok(!/Ко входу сотрудников/.test(t) && !/В приложение клиента/.test(t), `${page}: без аэропорта ссылок`)
}

ok(/LegalPageShell/.test(src('src/components/legal/LegalPageShell.jsx')), 'LegalPageShell есть')
ok(/CloseButton/.test(src('src/components/legal/LegalPageShell.jsx')), 'крестик CloseButton')

if (failed) {
  console.error(`\nverify-legal-page-close: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-legal-page-close: ok')
