/**
 * node scripts/verify-club-sms-campaign.mjs
 */
import {
  CLUB_SMS_CAMPAIGN_CONFIRM_CODE,
  CLUB_SMS_CAMPAIGN_RATE_PER_MIN,
  buildClubSmsCampaignConfirmSummary,
  clientHasSendableClubSmsPhone,
  clubSmsCampaignPaceDelayMs,
  estimateClubSmsCampaignDurationSec,
  formatClubSmsCampaignDurationRu,
  isClubSmsCampaignConfirmCode,
  normalizeClubSmsCampaignText,
  partitionClubSmsCampaignClients,
  resolveClubSmsCampaignRecipients,
  selectAllClubSmsCampaignEligible,
  toggleClubSmsCampaignSelection,
} from '../src/lib/admin/clubSmsCampaignCore.js'
import { CLIENT_HARD_DELETE_CONFIRM_CODE } from '../src/lib/clientHardDeleteConfirmCore.js'
import { runClubSmsCampaign } from '../src/lib/admin/clubSmsCampaignRunner.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(CLUB_SMS_CAMPAIGN_CONFIRM_CODE === CLIENT_HARD_DELETE_CONFIRM_CODE, 'same confirm code as delete')
ok(isClubSmsCampaignConfirmCode('124578'), 'confirm ok')
ok(!isClubSmsCampaignConfirmCode('0000'), 'confirm reject')

ok(clientHasSendableClubSmsPhone({ phone: '89991234567' }), 'phone 8…')
ok(clientHasSendableClubSmsPhone({ phone: '+7 (999) 123-45-67' }), 'phone formatted')
ok(!clientHasSendableClubSmsPhone({ phone: '123' }), 'phone short')
ok(!clientHasSendableClubSmsPhone({ phone: '' }), 'phone empty')

const part = partitionClubSmsCampaignClients([
  { id: 'a', name: 'Аня', phone: '79991112233' },
  { id: 'b', name: 'Боря', phone: '' },
  { id: 'c', name: 'Вася', phone: '79001112233' },
])
ok(part.eligible.length === 2 && part.skippedNoPhone.length === 1, 'partition phones')

const all = selectAllClubSmsCampaignEligible(part.eligible)
ok(all.size === 2 && all.has('a') && all.has('c'), 'select all eligible')

let sel = new Set(['a'])
sel = toggleClubSmsCampaignSelection(sel, 'c', true)
sel = toggleClubSmsCampaignSelection(sel, 'a', false)
const recipients = resolveClubSmsCampaignRecipients(sel, part.eligible)
ok(recipients.length === 1 && recipients[0].id === 'c', 'toggle selection')

ok(clubSmsCampaignPaceDelayMs() === Math.ceil(60_000 / CLUB_SMS_CAMPAIGN_RATE_PER_MIN), 'pace delay')
ok(estimateClubSmsCampaignDurationSec(1) === 0, 'duration 1')
ok(estimateClubSmsCampaignDurationSec(21) >= 60, 'duration 21 ~1min+')
ok(formatClubSmsCampaignDurationRu(90).includes('мин'), 'duration label')

const summary = buildClubSmsCampaignConfirmSummary({
  recipients: part.eligible,
  text: '  Привет от клуба  ',
  namePreviewLimit: 1,
})
ok(summary.count === 2 && summary.canLaunch, 'summary can launch')
ok(summary.text === 'Привет от клуба', 'summary trim text')
ok(summary.namePreview.length === 1 && summary.namesHidden === 1, 'name preview truncate')
ok(!buildClubSmsCampaignConfirmSummary({ recipients: [], text: 'x' }).canLaunch, 'empty recipients')
ok(normalizeClubSmsCampaignText('x'.repeat(600)).length === 500, 'text max 500')

const calls = []
const result = await runClubSmsCampaign({
  clubId: 'club1',
  text: 'Тест',
  recipients: [
    { id: 'a', name: 'Аня' },
    { id: 'b', name: 'Боря' },
  ],
  paceDelayMs: 0,
  sendFn: async (p) => {
    calls.push(p.clientId)
    if (p.clientId === 'b') {
      const err = new Error('нет сети')
      err.code = 'network'
      throw err
    }
    return { ok: true, scenario: 'custom', log_id: `log_${p.clientId}` }
  },
  sleepFn: async () => {},
  logFn: async () => {},
})
ok(calls.join(',') === 'a,b', 'runner order')
ok(result.ok === 1 && result.fail === 1, 'runner ok/fail')
ok(result.errors[0]?.id === 'b', 'runner error id')

let rateTries = 0
const rateResult = await runClubSmsCampaign({
  clubId: 'club1',
  text: 'Тест',
  recipients: [{ id: 'x', name: 'X' }],
  paceDelayMs: 0,
  maxRateRetries: 3,
  sendFn: async () => {
    rateTries += 1
    if (rateTries < 3) {
      const err = new Error('Слишком много SMS')
      err.code = 'too_many_sms'
      err.retry_after_sec = 1
      throw err
    }
    return { ok: true, scenario: 'custom' }
  },
  sleepFn: async () => {},
  logFn: async () => {},
})
ok(rateTries === 3 && rateResult.ok === 1, 'runner retries rate limit')

const abortCtrl = new AbortController()
let abortCalls = 0
const abortPromise = runClubSmsCampaign({
  clubId: 'club1',
  text: 'Тест',
  recipients: [
    { id: '1', name: '1' },
    { id: '2', name: '2' },
    { id: '3', name: '3' },
  ],
  paceDelayMs: 50,
  signal: abortCtrl.signal,
  sendFn: async () => {
    abortCalls += 1
    if (abortCalls === 1) abortCtrl.abort()
    return { ok: true, scenario: 'custom' }
  },
  sleepFn: (ms, signal) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms)
      signal?.addEventListener?.(
        'abort',
        () => {
          clearTimeout(t)
          reject(Object.assign(new Error('Отменено'), { code: 'aborted' }))
        },
        { once: true },
      )
    }),
  logFn: async () => {},
})
const abortResult = await abortPromise
ok(abortResult.aborted === true && abortResult.ok === 1, 'runner abort after first')

ok(
  !buildClubSmsCampaignConfirmSummary({ recipients: part.eligible, text: '   ' }).canLaunch,
  'blank text cannot launch',
)

if (failed) process.exit(1)
console.log('verify-club-sms-campaign: all ok')
