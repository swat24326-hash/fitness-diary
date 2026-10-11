/**
 * Листание Ежедневника пальцем вбок на телефоне: когда считать жест листанием и в какую сторону.
 */
import {
  SWIPE_AXIS_LOCK_PX,
  resolveSwipeAxis,
  resolveSwipeCommit,
} from '../src/lib/trainer/scheduleSwipeCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed++
    console.error(`FAIL: ${msg}`)
  }
}

ok(resolveSwipeAxis(3, 4) === null, 'дрожание пальца — ещё не решаем')
ok(resolveSwipeAxis(SWIPE_AXIS_LOCK_PX + 2, 3) === 'x', 'вбок — листаем')
ok(resolveSwipeAxis(-20, 5) === 'x', 'влево — тоже листание')
ok(resolveSwipeAxis(6, 30) === 'y', 'вверх-вниз — часы, не листаем')
ok(resolveSwipeAxis(15, 15) === 'y', 'ровно по диагонали — отдаём прокрутке часов')

ok(resolveSwipeCommit({ dx: -120, width: 360, ms: 600 }) === 'next', 'палец влево на треть экрана — вперёд')
ok(resolveSwipeCommit({ dx: 120, width: 360, ms: 600 }) === 'prev', 'палец вправо на треть экрана — назад')
ok(resolveSwipeCommit({ dx: -60, width: 360, ms: 600 }) === null, 'медленно и недалеко — пружинит обратно')
ok(resolveSwipeCommit({ dx: -60, width: 360, ms: 100 }) === 'next', 'быстрый взмах — листает и с коротким ходом')
ok(resolveSwipeCommit({ dx: 30, width: 360, ms: 20 }) === null, 'короткий рывок меньше порога — не листает')
ok(resolveSwipeCommit({ dx: 0, width: 360, ms: 100 }) === null, 'без сдвига — ничего')
ok(resolveSwipeCommit({ dx: -100, width: 0, ms: 500 }) === 'next', 'ширина неизвестна — не падаем')

if (failed) {
  console.error(`verify-schedule-swipe: ${failed} failed`)
  process.exit(1)
}
console.log('verify-schedule-swipe: all passed')
