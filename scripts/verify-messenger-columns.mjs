/**
 * Мессенджер сотрудников: вид по ширине экрана и ширина колонок, подвинутая на мониторе.
 * node scripts/verify-messenger-columns.mjs
 */
import {
  MSGR_COL_LIMITS,
  clampMessengerCol,
  messengerColsStyle,
  messengerModeOf,
  parseMessengerCols,
} from '../src/lib/chat/messengerColumnsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

ok(messengerModeOf({ width: 390 }) === 'phone', 'телефон — одна панель')
ok(messengerModeOf({ width: 760 }) === 'phone', '760 — ещё телефон')
ok(messengerModeOf({ width: 761 }) === 'tablet', '761 — планшет, две колонки')
ok(messengerModeOf({ width: 1180 }) === 'tablet', 'планшет тренера 1180 — две колонки')
ok(messengerModeOf({ width: 1200 }) === 'monitor', '1200 — монитор, три колонки')
ok(messengerModeOf({ width: 1920, compact: true }) === 'phone', 'телефон тренера /coach на большом экране — всё равно одна панель')

ok(clampMessengerCol('rail', 50) === MSGR_COL_LIMITS.rail.min, 'папки уже предела — до минимума')
ok(clampMessengerCol('list', 5000) === MSGR_COL_LIMITS.list.max, 'список шире предела — до максимума')
ok(clampMessengerCol('list', 333.6) === 334, 'ширина — целые пиксели')
ok(clampMessengerCol('rail', 'abc') === null && clampMessengerCol('thread', 300) === null, 'мусор и чужая колонка — нет ширины')

const saved = parseMessengerCols('{"rail":220,"list":9999}')
ok(saved.rail === 220 && saved.list === MSGR_COL_LIMITS.list.max, 'сохранённое читается и подрезается пределами')
const junk = parseMessengerCols('{не json')
ok(junk.rail === null && junk.list === null, 'испорченное сохранение — ширина по умолчанию, экран не падает')
ok(parseMessengerCols(null).rail === null, 'ничего не сохранено — по умолчанию')

const style = messengerColsStyle({ rail: 240, list: null })
ok(style['--msgr-rail'] === 'min(240px, 25%)' && !('--msgr-list' in style), 'подвинута только колонка папок — переменная только для неё, с долей экрана сверху')

if (failed) {
  console.error(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-messenger-columns: ok')
