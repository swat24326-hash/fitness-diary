import { buildNutritionPlanShareMessages } from '../src/lib/nutrition/nutritionPlanShareCore.js'
import { buildHomeworkShareMessages } from '../src/lib/homework/homeworkShareCore.js'
import {
  formatTrainerPngShareError,
  formatTrainerPngShareStatus,
  isTrainerPngMaxDeliveryOk,
  isTrainerPngShareUsable,
  shouldDownloadPngAfterOtherShare,
} from '../src/lib/trainer/trainerPngShareCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const nutrition = buildNutritionPlanShareMessages({ clubName: 'FIT-CITY', clientName: 'Иван Петров' })
ok(nutrition.shareTitle === 'FIT-CITY · мерный рацион для Иван Петров', 'nutrition title')
ok(nutrition.shareText.includes('картинку во вложении'), 'nutrition text mentions attachment')
ok(nutrition.shareText.length > nutrition.shareTitle.length, 'nutrition text longer than title')

const homework = buildHomeworkShareMessages({
  draft: { title: 'Спина' },
  clubName: 'FIT-CITY',
  clientName: 'Мария',
  trainerName: 'Олег',
})
ok(homework.shareTitle === 'FIT-CITY · Спина', 'homework title')
ok(homework.shareText.includes('на картинке'), 'homework text mentions image')

ok(shouldDownloadPngAfterOtherShare({ ok: false }), 'download when share failed')
ok(!shouldDownloadPngAfterOtherShare({ ok: false, cancelled: true }), 'no download when cancelled')
ok(!shouldDownloadPngAfterOtherShare({ ok: true, mode: 'file' }), 'no download when shared')

ok(isTrainerPngMaxDeliveryOk({ copied: true, opened: false }), 'max ok with copy')
ok(isTrainerPngMaxDeliveryOk({ copied: false, opened: true }), 'max ok with open')
ok(!isTrainerPngMaxDeliveryOk({ copied: false, opened: false }), 'max fail without copy/open')

ok(
  isTrainerPngShareUsable({ ok: true, channel: 'max', downloaded: true, copied: true, opened: true }),
  'usable max success',
)
ok(isTrainerPngShareUsable({ ok: true, channel: 'other', shared: true }), 'usable other native share')
ok(isTrainerPngShareUsable({ ok: true, channel: 'other', cancelled: true }), 'cancelled is usable noop')
ok(!isTrainerPngShareUsable({ ok: false, error: 'max_failed' }), 'failed max not usable')

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'max',
    downloaded: true,
    copied: true,
    opened: true,
    openMode: 'direct_chat',
  }).includes('PNG скачан'),
  'max status mentions download',
)

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'other',
    shared: true,
    shareMode: 'file',
  }).includes('картинка и текст'),
  'other file share status',
)

ok(formatTrainerPngShareStatus({ ok: true, cancelled: true, channel: 'other' }) === 'Отменено', 'cancelled status')

ok(
  formatTrainerPngShareError({ error: 'max_failed', downloaded: true, copied: true }).includes('PNG в загрузках'),
  'max_failed error mentions download',
)

ok(
  formatTrainerPngShareStatus({
    ok: false,
    error: 'max_failed',
    downloaded: true,
    copied: false,
  }).includes('Max'),
  'status routes max_failed to error text',
)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll trainer PNG share checks passed.')
