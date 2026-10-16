/**
 * Удобство переключения страниц: жест «назад», replace на «←», возврат с legal.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NAV_BACK_REPLACE_TARGETS,
  NAV_LEGAL_RETURN_TARGETS,
  findBlindHistoryBack,
} from '../src/lib/nav/navPageSwitchCore.js'
import { NAV_BACK_REPLACE } from '../src/lib/nav/navBackReplaceCore.js'
import {
  legalLinkNavState,
  resolveLegalClose,
} from '../src/lib/legal/legalPageCloseCore.js'

const root = fileURLToPath(new URL('..', import.meta.url))
let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(join(root, p), 'utf8')

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkJs(full, out)
    else if (/\.(jsx?|mjs|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

console.log('канон')
ok(NAV_BACK_REPLACE === true, 'назад с вложенного = replace')

console.log('сценарии возврата (logic)')
const fromChat = resolveLegalClose({
  state: legalLinkNavState({ pathname: '/messages', search: '?folder=clients', fromProfile: false }),
})
ok(fromChat.to === '/messages?folder=clients', 'legal ← из сообщений с query')
const fromProfile = resolveLegalClose({
  state: legalLinkNavState({ pathname: '/trainer', fromProfile: true }),
})
ok(fromProfile.reopenMyProfile && fromProfile.to === '/trainer', 'legal ← в профиль тренера')

console.log('replace на кнопках «←» и вкладках')
for (const t of NAV_BACK_REPLACE_TARGETS) {
  ok(t.re.test(src(t.file)), t.label)
}

console.log('legal: помним откуда пришли')
for (const t of NAV_LEGAL_RETURN_TARGETS) {
  ok(src(t.file).includes(t.needle), t.label)
}
ok(!/target="_blank"/.test(src('src/components/legal/SupervisorOfferGate.jsx')), 'оферта из gate — та же вкладка')

console.log('нет слепого history.back по src/')
const files = walkJs(join(root, 'src'))
let blind = 0
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, '/')
  if (rel.endsWith('navPageSwitchCore.js') || rel.endsWith('legalPageCloseCore.js')) continue
  const hits = findBlindHistoryBack(readFileSync(file, 'utf8'))
  if (!hits.length) continue
  blind++
  failed++
  console.error(`  ✗ ${rel}: ${hits.join(', ')}`)
}
ok(blind === 0, `проверено файлов: ${files.length}, слепых back нет`)

if (failed) {
  console.error(`\nverify-nav-page-switch: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-nav-page-switch: ok')
