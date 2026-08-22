import { buildNutritionPlanShareMessages, buildNutritionPlanShareText } from '../src/lib/nutrition/nutritionPlanShareCore.js'
import { resolveMaxPngOpenTarget } from '../src/lib/trainer/trainerPngShareCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const msgs = buildNutritionPlanShareMessages({
  clubName: 'FIT-CITY Клинцы',
  clientName: 'Выборнова Елена Николаевна',
})
ok(msgs.shareTitle === 'FIT-CITY Клинцы · мерный рацион для Елена', 'greeting name in title')
ok(msgs.shareText.includes('на картинке'), 'full text for other messenger')
ok(msgs.shareTitle.length < msgs.shareText.length, 'Max caption shorter than other text')

const maxTarget = resolveMaxPngOpenTarget({ maxChatUrl: 'https://max.ru/u/abc123' })
ok(maxTarget.mode === 'direct_chat', 'max png opens direct chat')
ok(!maxTarget.url.includes('share?text='), 'max png never prefills share text')

const maxFallback = resolveMaxPngOpenTarget({ maxChatUrl: '' })
ok(maxFallback.mode === 'app', 'max png fallback opens app')
ok(!maxFallback.url.includes('share?text='), 'max png fallback no text url')

ok(buildNutritionPlanShareText({}) === 'Мерный рацион', 'legacy share text fallback')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition plan share checks passed.')
