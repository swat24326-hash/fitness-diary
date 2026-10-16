/**
 * Правила переписки /chat-rules: разделы, ссылки на входах, связка с политикой.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CHAT_RULES_LINK_RU,
  CHAT_RULES_MUST_COVER,
  CHAT_RULES_PATH,
  CHAT_RULES_TITLE,
  CHAT_RULES_UPDATED,
  chatRulesSections,
} from '../src/lib/legal/chatRulesCore.js'
import { PRIVACY_POLICY_PATH } from '../src/lib/legal/privacyPolicyCore.js'

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
ok(CHAT_RULES_PATH === '/chat-rules', 'путь /chat-rules')
ok(CHAT_RULES_TITLE.includes('Правила переписки') && CHAT_RULES_TITLE.includes('Ядро'), 'заголовок')
ok(/^\d{4}-\d{2}-\d{2}$/.test(CHAT_RULES_UPDATED), 'дата обновления')
ok(CHAT_RULES_LINK_RU === 'Правила переписки', 'текст ссылки')
ok(PRIVACY_POLICY_PATH === '/privacy', 'политика отдельно на /privacy')

console.log('разделы')
const sections = chatRulesSections()
const ids = sections.map((s) => s.id)
for (const id of ['club', 'tone', 'secrets', 'files', 'keep', 'help']) {
  ok(ids.includes(id), `раздел ${id}`)
}
const blob = sections.map((s) => `${s.title} ${s.body}`).join('\n')
for (const needle of CHAT_RULES_MUST_COVER) {
  ok(blob.includes(needle), `в тексте есть «${needle}»`)
}
ok(sections.every((s) => s.title && s.body.length > 40), 'разделы не пустые')

console.log('wiring')
ok(/path="\/chat-rules"/.test(src('src/App.jsx')) && /ChatRulesPage/.test(src('src/App.jsx')), 'маршрут в App')
ok(/LegalEntryLinks/.test(src('src/pages/Login.jsx')), 'ссылки на /login')
ok(/LegalEntryLinks/.test(src('src/pages/coach/CoachSignInPage.jsx')), 'ссылки на /coach')
ok(/LegalEntryLinks/.test(src('src/pages/client/ClientMePage.jsx')), 'ссылки на /me')
ok(/CHAT_RULES_PATH/.test(src('src/pages/legal/PrivacyPolicyPage.jsx')), 'политика ссылается на правила')
ok(/PRIVACY_POLICY_PATH/.test(src('src/pages/legal/ChatRulesPage.jsx')), 'правила ссылаются на политику')

if (failed) {
  console.error(`\nverify-chat-rules: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-chat-rules: ok')
