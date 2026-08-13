/**
 * node scripts/verify-moi-zvonki-call.mjs
 */
import {
  buildMakeCallRequestPayload,
  buildMoiZvonkiFormBody,
  checkClubCallRateLimit,
  resetClubSmsRateLimitForTests,
  sendMoiZvonkiCall,
} from '../api/_lib/moiZvonkiCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const payload = buildMakeCallRequestPayload({
  userName: 'a@b.ru',
  apiKey: 'secret',
  to: '89991234567',
})
ok(payload.action === 'calls.make_call', 'action make_call')
ok(payload.to === '79991234567', 'payload phone normalized')
ok(payload.user_name === 'a@b.ru' && payload.api_key === 'secret', 'auth fields')
ok(!('text' in payload), 'no text field')

const form = buildMoiZvonkiFormBody(payload)
ok(decodeURIComponent(form).includes('"action":"calls.make_call"'), 'form encodes make_call')

resetClubSmsRateLimitForTests()
ok(checkClubCallRateLimit('c', { limit: 2, now: 1000 }).ok, 'call rate 1')
ok(checkClubCallRateLimit('c', { limit: 2, now: 1001 }).ok, 'call rate 2')
const blocked = checkClubCallRateLimit('c', { limit: 2, now: 1002 })
ok(!blocked.ok && blocked.error === 'too_many_calls', 'call rate blocked')

const mockFetch = async (_url, init) => {
  const body = String(init?.body ?? '')
  ok(body.includes('request_data='), 'fetch body form')
  ok(decodeURIComponent(body).includes('"action":"calls.make_call"'), 'fetch action make_call')
  return {
    ok: true,
    status: 200,
    text: async () => '{"ok":true}',
  }
}

const sent = await sendMoiZvonkiCall({
  to: '79991234567',
  env: {
    MOIZVONKI_API_BASE: 'https://fitcity.moizvonki.ru/api/v1',
    MOIZVONKI_API_KEY: 'k',
    MOIZVONKI_USER_EMAIL: 'a@b.ru',
  },
  fetchImpl: mockFetch,
})
ok(sent.ok === true && sent.phone === '79991234567', 'call send ok')

const missing = await sendMoiZvonkiCall({
  to: '79991234567',
  env: {},
  fetchImpl: mockFetch,
})
ok(missing.ok === false && missing.code === 'not_configured', 'call not configured')

const badPhone = await sendMoiZvonkiCall({
  to: '12',
  env: {
    MOIZVONKI_API_BASE: 'https://fitcity.moizvonki.ru/api/v1',
    MOIZVONKI_API_KEY: 'k',
    MOIZVONKI_USER_EMAIL: 'a@b.ru',
  },
  fetchImpl: mockFetch,
})
ok(badPhone.ok === false && badPhone.code === 'bad_phone', 'call bad phone')

if (failed) process.exit(1)
console.log('verify-moi-zvonki-call: all passed')
