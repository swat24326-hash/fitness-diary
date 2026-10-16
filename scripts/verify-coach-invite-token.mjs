/**
 * Токен QR телефона тренера из скана.
 * node scripts/verify-coach-invite-token.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCoachJoinUrl } from '../src/lib/coach/coachJoinLink.js'
import { coachInviteScanFromRaw, coachInviteTokenFromScan } from '../src/lib/coach/coachInviteTokenCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

const TOKEN = 'CoachQrToken_0123456789abcdef'
const join = buildCoachJoinUrl('https://app-core.ru', TOKEN)

console.log('coachInviteScanFromRaw')
ok(coachInviteScanFromRaw(join)?.kind === 'qr' && coachInviteScanFromRaw(join)?.token === TOKEN, 'URL /coach/join#t=…')
ok(coachInviteScanFromRaw(`https://app-core.ru/coach/?h=${TOKEN}`)?.kind === 'handoff', 'handoff ?h=')
ok(coachInviteTokenFromScan(TOKEN) === TOKEN, 'голый токен')
ok(coachInviteScanFromRaw('https://evil/me/join#t=short') == null, 'чужой короткий')
ok(coachInviteScanFromRaw('not a qr') == null, 'текст без токена')

console.log('UI входа /coach')
ok(/CoachQrScanSheet/.test(src('src/pages/coach/CoachSignInPage.jsx')), 'SignIn → сканер')
ok(/Войти по QR/.test(src('src/pages/coach/CoachSignInPage.jsx')), 'кнопка Войти по QR')
ok(/ClientInstallHint/.test(src('src/pages/coach/CoachSignInPage.jsx')), 'шаг установки на входе')
ok(/redeemCoachQr/.test(src('src/pages/coach/CoachQrScanSheet.jsx')), 'redeem QR')
ok(/useQrFrameScan/.test(src('src/pages/coach/useCoachQrScan.js')), 'общий сканер кадров')

if (failed) {
  console.error(`\nverify-coach-invite-token: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-coach-invite-token: ok')
