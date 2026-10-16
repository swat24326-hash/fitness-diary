/**
 * Токен из QR / ссылки входа клиента.
 * node scripts/verify-client-invite-token.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildClientJoinUrl } from '../src/lib/client/clientJoinUrl.js'
import { clientInviteTokenFromScan, isClientInviteTokenShape } from '../src/lib/client/clientInviteTokenCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

const TOKEN = 'kLhQxSXUAtjLdQY5fKVmf2QRp373m1PE'
const join = buildClientJoinUrl('https://app-core.ru', TOKEN)

console.log('clientInviteTokenFromScan')
ok(clientInviteTokenFromScan(join) === TOKEN, 'URL /me/join#t=…')
ok(clientInviteTokenFromScan(`${join}&x=1`) === TOKEN || clientInviteTokenFromScan(join) === TOKEN, 'join URL')
ok(clientInviteTokenFromScan(`https://app-core.ru/me/?h=${TOKEN}`) === TOKEN, 'handoff ?h=')
ok(clientInviteTokenFromScan(TOKEN) === TOKEN, 'голый токен')
ok(clientInviteTokenFromScan('https://evil.example/me/join#t=short') === '', 'короткий мусор')
ok(clientInviteTokenFromScan('not a qr') === '', 'текст без токена')
ok(isClientInviteTokenShape(TOKEN), 'форма токена')
ok(!isClientInviteTokenShape('ab'), 'слишком короткий')

console.log('UI входа')
ok(/ClientSignInPanel/.test(src('src/pages/client/ClientMePage.jsx')), 'ClientMePage → SignInPanel')
ok(/Войти по QR/.test(src('src/pages/client/ClientSignInPanel.jsx')), 'кнопка Войти по QR')
ok(/ClientInstallHint/.test(src('src/pages/client/ClientSignInPanel.jsx')), 'шаг установки на экране входа')
ok(/ClientQrScanSheet/.test(src('src/pages/client/ClientSignInPanel.jsx')), 'сканер')
ok(/useQrFrameScan/.test(src('src/pages/client/useClientQrScan.js')), 'общий сканер кадров')
ok(/jsqr|jsQR/.test(src('src/hooks/useQrFrameScan.js')), 'декод кадра jsQR')
ok(/redeemClientInvite/.test(src('src/pages/client/ClientQrScanSheet.jsx')), 'redeem после скана')

if (failed) {
  console.error(`\nverify-client-invite-token: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-client-invite-token: ok')
