/**
 * Политика конфиденциальности A2: путь /privacy, разделы из PD_152FZ §5, ссылки на входах.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PRIVACY_POLICY_LINK_RU,
  PRIVACY_POLICY_MUST_COVER,
  PRIVACY_POLICY_PATH,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_UPDATED,
  privacyPolicySections,
} from '../src/lib/legal/privacyPolicyCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

console.log('контракт')
ok(PRIVACY_POLICY_PATH === '/privacy', 'путь /privacy')
ok(PRIVACY_POLICY_TITLE.includes('конфиденциальности') && PRIVACY_POLICY_TITLE.includes('Ядро'), 'заголовок')
ok(/^\d{4}-\d{2}-\d{2}$/.test(PRIVACY_POLICY_UPDATED), 'дата обновления')
ok(PRIVACY_POLICY_LINK_RU === 'Политика конфиденциальности', 'текст ссылки')

console.log('разделы A2')
const sections = privacyPolicySections()
const ids = sections.map((s) => s.id)
for (const id of ['who', 'roles', 'data', 'purpose', 'where', 'term', 'delete', 'protect']) {
  ok(ids.includes(id), `раздел ${id}`)
}
const blob = sections.map((s) => `${s.title} ${s.body}`).join('\n')
for (const needle of PRIVACY_POLICY_MUST_COVER) {
  ok(blob.includes(needle), `в тексте есть «${needle}»`)
}
ok(sections.every((s) => s.title && s.body.length > 40), 'разделы не пустые')

console.log('wiring')
ok(/path="\/privacy"/.test(src('src/App.jsx')) && /PrivacyPolicyPage/.test(src('src/App.jsx')), 'маршрут в App')
ok(/LegalEntryLinks/.test(src('src/pages/Login.jsx')), 'ссылки на /login')
ok(/LegalEntryLinks/.test(src('src/pages/coach/CoachSignInPage.jsx')), 'ссылки на входе /coach')
ok(/LegalEntryLinks/.test(src('src/pages/client/ClientMePage.jsx')), 'ссылки на входе /me')
ok(/CHAT_RULES_PATH/.test(src('src/lib/legal/privacyPolicyCore.js')), 'путь правил переписки рядом с политикой')
ok(/privacy-policy\.css/.test(src('src/index.css')), 'стили подключены')
ok(/A2/.test(src('docs/PD_152FZ.md')) && /\/privacy/.test(src('docs/PD_152FZ.md')), 'PD_152FZ знает страницу')

if (failed) {
  console.error(`\nverify-privacy-policy: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-privacy-policy: ok')
