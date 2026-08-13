/**
 * node scripts/verify-club-sms-campaign-result.mjs
 */
import { buildClubSmsCampaignResultSummary } from '../src/lib/admin/clubSmsCampaignResultCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const allOk = buildClubSmsCampaignResultSummary({ ok: 5, fail: 0, errors: [] }, { recipientsCount: 5 })
ok(allOk.tone === 'ok' && allOk.title === 'Рассылка завершена', 'all ok tone/title')
ok(allOk.headline === 'Ушло 5 из 5', 'all ok headline')
ok(!allOk.hasErrors, 'all ok no errors')

const mixed = buildClubSmsCampaignResultSummary(
  {
    ok: 2,
    fail: 1,
    errors: [{ id: 'c1', name: 'Иванов', error: 'нет сети' }],
  },
  { recipientsCount: 3 },
)
ok(mixed.tone === 'warn' && mixed.title === 'Рассылка с ошибками', 'mixed warn')
ok(mixed.headline.includes('Ушло 2') && mixed.headline.includes('ошибок 1'), 'mixed headline')
ok(mixed.hasErrors && mixed.errors[0].name === 'Иванов', 'mixed errors')

const none = buildClubSmsCampaignResultSummary({ ok: 0, fail: 3, errors: [{ error: 'x' }] })
ok(none.tone === 'err' && none.title === 'Ничего не ушло', 'all fail')

const aborted = buildClubSmsCampaignResultSummary({ ok: 1, fail: 0, aborted: true, errors: [] })
ok(aborted.tone === 'warn' && aborted.title === 'Рассылка остановлена', 'aborted')
ok(aborted.headline.includes('остановлено'), 'aborted headline')

if (failed) process.exit(1)
console.log('\nverify-club-sms-campaign-result: all passed')
