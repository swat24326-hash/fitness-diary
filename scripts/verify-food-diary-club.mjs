/**
 * Клубный флаг дневника калорий: default off, патч, публичные поля /me.
 * node scripts/verify-food-diary-club.mjs
 */
import {
  FOOD_DIARY_CLUB_LABEL,
  FOOD_DIARY_ROUTE,
  clubFoodDiaryEnabled,
  foodDiaryClubStatusRu,
  isFoodDiaryEnabled,
  patchClubFoodDiary,
  publicClubFoodDiaryFields,
} from '../src/lib/client/foodDiaryClubCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(FOOD_DIARY_ROUTE === '/me/food-diary', 'маршрут клиента')
ok(Boolean(FOOD_DIARY_CLUB_LABEL), 'подпись админки')

ok(isFoodDiaryEnabled(true) === true, 'true → вкл')
ok(isFoodDiaryEnabled(false) === false, 'false → выкл')
ok(isFoodDiaryEnabled(undefined) === false, 'undefined → выкл (пилот)')
ok(isFoodDiaryEnabled(null) === false, 'null → выкл')
ok(isFoodDiaryEnabled(1) === false, 'число не считается вкл')
ok(isFoodDiaryEnabled('true') === false, 'строка не считается вкл')

ok(clubFoodDiaryEnabled({}) === false, 'клуб без поля → выкл')
ok(clubFoodDiaryEnabled({ food_diary_enabled: true }) === true, 'клуб с true')
ok(clubFoodDiaryEnabled({ food_diary_enabled: false }) === false, 'клуб с false')

const patched = patchClubFoodDiary({ id: 'c1', name: 'А', food_diary_enabled: false }, true)
ok(patched.food_diary_enabled === true && patched.id === 'c1' && patched.name === 'А', 'патч сохраняет поля')
ok(patchClubFoodDiary(patched, false).food_diary_enabled === false, 'патч выкл')

const pubOff = publicClubFoodDiaryFields({ name: 'X' }, '/m')
ok(pubOff.food_diary_enabled === false && pubOff.manifest_url === '/m', 'публично: выкл + manifest')
const pubOn = publicClubFoodDiaryFields({ food_diary_enabled: true }, null)
ok(pubOn.food_diary_enabled === true && !('manifest_url' in pubOn), 'публично: вкл без manifest')

ok(foodDiaryClubStatusRu(true).includes('вкл'), 'статус ru вкл')
ok(foodDiaryClubStatusRu(false).includes('выкл'), 'статус ru выкл')

console.log('verify-food-diary-club: OK')
