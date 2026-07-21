/**
 * node scripts/verify-moi-zvonki.mjs
 */
import {
  buildMoiZvonkiFormBody,
  buildSendSmsRequestPayload,
  checkClubSmsRateLimit,
  getMoiZvonkiConfigFromEnv,
  isMoiZvonkiConfigured,
  isValidMoiZvonkiPhone,
  mapMoiZvonkiHttpErrorToRu,
  normalizeMoiZvonkiPhone,
  resetClubSmsRateLimitForTests,
  sendMoiZvonkiSms,
} from '../api/_lib/moiZvonkiCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeMoiZvonkiPhone('+7 (999) 123-45-67') === '79991234567', 'phone +7')
ok(normalizeMoiZvonkiPhone('89991234567') === '79991234567', 'phone 8… → 7…')
ok(normalizeMoiZvonkiPhone('9991234567') === '79991234567', 'phone 10 digits')
ok(isValidMoiZvonkiPhone('79991234567'), 'valid phone')
ok(!isValidMoiZvonkiPhone('123'), 'short phone invalid')

const cfgEmpty = getMoiZvonkiConfigFromEnv({})
ok(!isMoiZvonkiConfigured({}), 'not configured empty env')
ok(!cfgEmpty.apiKey && !cfgEmpty.apiBase, 'empty config fields')

const cfgDomain = getMoiZvonkiConfigFromEnv({
  MOIZVONKI_DOMAIN: 'fitcity',
  MOIZVONKI_API_KEY: 'test-key',
  MOIZVONKI_USER_EMAIL: 'club@example.com',
})
ok(cfgDomain.apiBase === 'https://fitcity.moizvonki.ru/api/v1', 'domain → api base')
ok(isMoiZvonkiConfigured({
  MOIZVONKI_DOMAIN: 'fitcity',
  MOIZVONKI_API_KEY: 'test-key',
  MOIZVONKI_USER_EMAIL: 'club@example.com',
}), 'configured via domain')

const cfgBase = getMoiZvonkiConfigFromEnv({
  MOIZVONKI_API_BASE: 'https://fitcity.moizvonki.ru/api/v1/',
  MOIZVONKI_API_KEY: 'k',
  MOIZVONKI_USER_EMAIL: 'a@b.ru',
})
ok(cfgBase.apiBase === 'https://fitcity.moizvonki.ru/api/v1', 'strip trailing slash')

const payload = buildSendSmsRequestPayload({
  userName: 'a@b.ru',
  apiKey: 'secret',
  to: '89991234567',
  text: 'Привет',
})
ok(payload.action === 'calls.send_sms', 'action send_sms')
ok(payload.to === '79991234567', 'payload phone normalized')
ok(payload.user_name === 'a@b.ru' && payload.api_key === 'secret', 'auth fields')

const form = buildMoiZvonkiFormBody(payload)
ok(form.includes('request_data='), 'form has request_data')
ok(decodeURIComponent(form).includes('"action":"calls.send_sms"'), 'form encodes json')

ok(mapMoiZvonkiHttpErrorToRu(401, {}).includes('авторизац'), '401 ru')
ok(mapMoiZvonkiHttpErrorToRu(500, {}).includes('недоступны'), '500 ru')

resetClubSmsRateLimitForTests()
ok(checkClubSmsRateLimit('t', { limit: 2, now: 1000 }).ok, 'rate 1')
ok(checkClubSmsRateLimit('t', { limit: 2, now: 1001 }).ok, 'rate 2')
const blocked = checkClubSmsRateLimit('t', { limit: 2, now: 1002 })
ok(!blocked.ok && blocked.error === 'too_many_sms', 'rate 3 blocked')

const mockFetch = async (_url, init) => {
  const body = String(init?.body ?? '')
  ok(body.includes('request_data='), 'fetch body form')
  ok(String(init?.headers?.['Content-Type'] ?? '').includes('x-www-form-urlencoded'), 'content-type form')
  return {
    ok: true,
    status: 200,
    text: async () => '{"ok":true}',
  }
}

const sent = await sendMoiZvonkiSms({
  to: '79991234567',
  text: 'Тест',
  env: {
    MOIZVONKI_API_BASE: 'https://fitcity.moizvonki.ru/api/v1',
    MOIZVONKI_API_KEY: 'k',
    MOIZVONKI_USER_EMAIL: 'a@b.ru',
  },
  fetchImpl: mockFetch,
})
ok(sent.ok === true && sent.phone === '79991234567', 'send ok')

const missing = await sendMoiZvonkiSms({
  to: '79991234567',
  text: 'Тест',
  env: {},
  fetchImpl: mockFetch,
})
ok(missing.ok === false && missing.code === 'not_configured', 'send not configured')

if (failed) process.exit(1)
console.log('verify-moi-zvonki: all passed')
