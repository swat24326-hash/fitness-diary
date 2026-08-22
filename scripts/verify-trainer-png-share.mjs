import { buildNutritionPlanShareMessages } from '../src/lib/nutrition/nutritionPlanShareCore.js'
import { buildHomeworkShareMessages } from '../src/lib/homework/homeworkShareCore.js'
import {
  formatTrainerPngShareError,
  formatTrainerPngShareStatus,
  isTrainerPngMaxDeliveryOk,
  isTrainerPngShareUsable,
  resolveMaxPngOpenTarget,
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

const nutrition = buildNutritionPlanShareMessages({
  clubName: 'FIT-CITY',
  clientName: 'Выборнова Елена Никolaevna',
})
ok(nutrition.shareTitle.includes('для Елена'), 'nutrition greeting in title')

const homework = buildHomeworkShareMessages({
  draft: { title: 'Спина' },
  clubName: 'FIT-CITY',
  clientName: 'Мария',
  trainerName: 'Олег',
})
ok(homework.shareTitle === 'FIT-CITY · Спина', 'homework title')

ok(shouldDownloadPngAfterOtherShare({ ok: false }), 'download when share failed')
ok(!shouldDownloadPngAfterOtherShare({ ok: false, cancelled: true }), 'no download when cancelled')

ok(isTrainerPngMaxDeliveryOk({ copied: true, opened: false, shared: false }), 'max ok with copy')
ok(isTrainerPngMaxDeliveryOk({ copiedImage: true, opened: false, shared: false }), 'max ok with image clipboard')
ok(isTrainerPngMaxDeliveryOk({ copied: false, opened: true, shared: false }), 'max ok with open')
ok(isTrainerPngMaxDeliveryOk({ copied: false, opened: false, shared: true }), 'max ok with native share')
ok(!isTrainerPngMaxDeliveryOk({ copied: false, opened: false, shared: false }), 'max fail without delivery')

ok(
  isTrainerPngShareUsable({ ok: true, channel: 'max', downloaded: true, copied: true, opened: true }),
  'usable max success',
)
ok(
  isTrainerPngShareUsable({ ok: true, channel: 'max', shared: true, copied: true }),
  'usable max with native share',
)

const direct = resolveMaxPngOpenTarget({ maxChatUrl: 'https://max.ru/@club' })
ok(direct.url === 'https://max.ru/@club', 'direct max chat url preserved')
const shareFallback = resolveMaxPngOpenTarget({ caption: 'FIT-CITY · ДЗ' })
ok(shareFallback.url.includes('text='), 'share fallback includes caption')

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'max',
    downloaded: true,
    copied: true,
    opened: true,
    openMode: 'direct_chat',
  }).includes('📎'),
  'max status asks to attach image',
)

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'max',
    downloaded: true,
    copied: true,
    opened: true,
    openMode: 'share',
  }).includes('открыто окно Max'),
  'max share mode status',
)

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'max',
    shared: true,
    openMode: 'native_share',
    copied: true,
  }).includes('Выберите Max'),
  'max native share status',
)

ok(
  formatTrainerPngShareStatus({
    ok: true,
    channel: 'max',
    copiedImage: true,
    copied: true,
  }).includes('картинка в буфере'),
  'max clipboard image status',
)

ok(
  formatTrainerPngShareStatus({ ok: true, cancelled: true, channel: 'max', copiedImage: true }).includes(
    'картинка в буфере',
  ),
  'cancelled keeps clipboard hint',
)

ok(
  formatTrainerPngShareError({ error: 'max_failed', downloaded: true, copied: true }).includes('откройте Max'),
  'max_failed mentions open max',
)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll trainer PNG share checks passed.')
