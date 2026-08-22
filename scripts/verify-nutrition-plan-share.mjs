import { buildNutritionPlanShareMessages, buildNutritionPlanShareText } from '../src/lib/nutrition/nutritionPlanShareCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const msgs = buildNutritionPlanShareMessages({ clubName: 'FIT-CITY', clientName: 'Иван Петров' })
ok(msgs.shareTitle === 'FIT-CITY · мерный рацион для Иван Петров', 'share title with club and client')
ok(msgs.shareText.startsWith(msgs.shareTitle), 'share text starts with title')
ok(msgs.shareText.includes('вложении'), 'share text explains attachment')

ok(
  buildNutritionPlanShareMessages({ clientName: 'Мария' }).shareTitle === 'Мерный рацион для Мария',
  'share title without club',
)
ok(buildNutritionPlanShareText({}) === 'Мерный рацион', 'legacy share text fallback')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition plan share checks passed.')
