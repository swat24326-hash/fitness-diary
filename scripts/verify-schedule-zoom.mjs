/**
 * Ежедневник: масштаб сетки (щипок, Ctrl+колёсико, кнопки меню) — чистые правила.
 * node scripts/verify-schedule-zoom.mjs
 */
import {
  SCHEDULE_ZOOM_DEFAULTS,
  SCHEDULE_ZOOM_MAX,
  SCHEDULE_ZOOM_MIN,
  clampScheduleZoom,
  formatScheduleZoomPercent,
  parseStoredScheduleZoom,
  resolvePinchScheduleZoom,
  resolveScheduleEntryMinHeight,
  resolveScheduleZoomScrollTop,
  resolveWheelScheduleZoom,
  scheduleZoomStorageKey,
  stepScheduleZoom,
} from '../src/lib/trainer/scheduleZoomCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ok  ${msg}`)
  else {
    failed++
    console.error(`  FAIL ${msg}`)
  }
}

console.log('clamp / storage')
ok(clampScheduleZoom(10, 1) === SCHEDULE_ZOOM_MAX, 'больше максимума → максимум')
ok(clampScheduleZoom(0.1, 1) === SCHEDULE_ZOOM_MIN, 'меньше минимума → минимум')
ok(clampScheduleZoom('abc', 1.4) === 1.4, 'мусор → запасное значение')
ok(clampScheduleZoom(-2, 1) === 1, 'отрицательное → запасное значение')
ok(parseStoredScheduleZoom(null, 1.4) === 1.4, 'нет сохранённого → умолчание экрана')
ok(parseStoredScheduleZoom('2', 1.4) === 2, 'сохранённое 2 читается')
ok(parseStoredScheduleZoom('99', 1.4) === SCHEDULE_ZOOM_MAX, 'сохранённое вне диапазона зажимается')
ok(scheduleZoomStorageKey('phone') !== scheduleZoomStorageKey('tablet'), 'телефон и планшет хранят масштаб раздельно')
ok(SCHEDULE_ZOOM_DEFAULTS.phone < SCHEDULE_ZOOM_DEFAULTS.tablet, 'телефон по умолчанию мельче планшета')

console.log('кнопки +/−')
ok(stepScheduleZoom(1.4, 1) === 2, '1.4 → крупнее 2')
ok(stepScheduleZoom(1.4, -1) === 1, '1.4 → мельче 1')
ok(stepScheduleZoom(1.2, 1) === 1.4, 'после щипка (1.2) «+» идёт к ближайшему шагу вверх')
ok(stepScheduleZoom(1.2, -1) === 1, 'после щипка (1.2) «−» идёт к ближайшему шагу вниз')
ok(stepScheduleZoom(SCHEDULE_ZOOM_MAX, 1) === SCHEDULE_ZOOM_MAX, 'на максимуме «+» не растёт')
ok(stepScheduleZoom(SCHEDULE_ZOOM_MIN, -1) === SCHEDULE_ZOOM_MIN, 'на минимуме «−» не падает')

console.log('щипок / колёсико')
ok(resolvePinchScheduleZoom(1, 100, 200) === 2, 'пальцы развели вдвое → масштаб ×2')
ok(resolvePinchScheduleZoom(1.4, 200, 100) === 0.7, 'пальцы свели вдвое → масштаб ÷2')
ok(resolvePinchScheduleZoom(2, 100, 1000) === SCHEDULE_ZOOM_MAX, 'щипок не выходит за максимум')
ok(resolvePinchScheduleZoom(1.4, 0, 100) === 1.4, 'нулевая стартовая дистанция → без изменений')
ok(resolveWheelScheduleZoom(1.4, -100) > 1.4, 'колёсико вверх с Ctrl → крупнее')
ok(resolveWheelScheduleZoom(1.4, 100) < 1.4, 'колёсико вниз с Ctrl → мельче')

console.log('якорь прокрутки')
{
  const from = 1
  const to = 2
  const scrollTop = 480
  const anchorY = 100
  const trackOffset = 0
  const minuteBefore = (scrollTop + anchorY - trackOffset) / from
  const next = resolveScheduleZoomScrollTop({ scrollTop, anchorY, trackOffset, fromZoom: from, toZoom: to })
  const minuteAfter = (next + anchorY - trackOffset) / to
  ok(minuteAfter === minuteBefore, 'минута под пальцами остаётся на месте при увеличении')
}
{
  const next = resolveScheduleZoomScrollTop({ scrollTop: 600, anchorY: 50, trackOffset: 40, fromZoom: 2, toZoom: 1 })
  ok((next + 50 - 40) / 1 === (600 + 50 - 40) / 2, 'с отступом трека тоже держит минуту при уменьшении')
}
ok(
  resolveScheduleZoomScrollTop({ scrollTop: 0, anchorY: 300, trackOffset: 0, fromZoom: 2, toZoom: 0.5 }) === 0,
  'у начала дня scrollTop не уходит в минус',
)

console.log('высота записи / подпись')
ok(resolveScheduleEntryMinHeight(48, 1.4) === 48, 'обычный масштаб — прежний минимум 48')
ok(resolveScheduleEntryMinHeight(48, 0.5) === 26, 'мелкий масштаб — часовая запись не наезжает на следующий час')
ok(resolveScheduleEntryMinHeight(78, 0.1) === 20, 'минимум не меньше 20px — запись остаётся тапабельной')
ok(formatScheduleZoomPercent(1.4, 1.4) === '100%', 'умолчание экрана = 100%')
ok(formatScheduleZoomPercent(2, 1) === '200%', 'телефон 2 px/мин = 200%')

if (failed) {
  console.error(`\nverify-schedule-zoom: ${failed} failed`)
  process.exit(1)
}
console.log('\nverify-schedule-zoom: all passed')
