/**
 * node scripts/verify-club-client-max-outreach.mjs
 */
import {
  buildClubDeskMaxFallbackMessage,
  runClubDeskMaxOpen,
} from '../src/lib/admin/clubClientMaxOutreachCore.js'
import { resolveMaxOpenTarget } from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(buildClubDeskMaxFallbackMessage('FIT').includes('FIT'), 'fallback club name')
ok(buildClubDeskMaxFallbackMessage('').includes('клуб'), 'fallback default')

const noContact = await runClubDeskMaxOpen({ client: {} })
ok(!noContact.ok && noContact.error === 'no_contact', 'no contact')

// Без текста — не трогаем clipboard (в Node navigator read-only)
const withUrl = await runClubDeskMaxOpen({
  client: { max_chat_url: 'https://max.ru/u/abc', phone: '' },
  message: '',
})
ok(withUrl.ok && withUrl.openMode === 'direct_chat' && !withUrl.copied, 'direct chat without phone')

const withPhone = await runClubDeskMaxOpen({
  client: { phone: '+7 999 111-22-33' },
  message: '',
})
ok(withPhone.ok && withPhone.openMode === 'share', 'share when no max url')

const target = resolveMaxOpenTarget({
  message: buildClubDeskMaxFallbackMessage('Зал А'),
  phone: '79991112233',
  maxChatUrl: null,
})
ok(target.mode === 'share' && target.url.includes('max.ru'), 'share url for club greeting')

if (failed) {
  console.error(`\nfailed: ${failed}`)
  process.exit(1)
}
console.log('\nAll club desk Max checks passed')
