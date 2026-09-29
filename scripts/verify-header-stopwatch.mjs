/**
 * Секундомер шапки: формат и elapsed без React.
 * node scripts/verify-header-stopwatch.mjs
 */
import {
  STOPWATCH_PAINT_MS,
  formatStopwatch,
  stopwatchElapsedMs,
} from '../src/lib/headerStopwatchCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(STOPWATCH_PAINT_MS === 100, 'отрисовка раз в 100 мс (десятые)')

ok(formatStopwatch(0) === '00:00.0', 'ноль')
ok(formatStopwatch(100) === '00:00.1', 'десятая')
ok(formatStopwatch(12_345) === '00:12.3', 'секунды')
ok(formatStopwatch(65_000) === '01:05.0', 'минуты')
ok(formatStopwatch(3_661_200) === '1:01:01', 'часы без десятых')
ok(formatStopwatch(-5) === '00:00.0', 'отрицательное → 0')
ok(formatStopwatch(Number.NaN) === '00:00.0', 'NaN → 0')

ok(
  stopwatchElapsedMs({ baseMs: 1000, startedAt: null, now: 9999 }) === 1000,
  'пауза — только base',
)
ok(
  stopwatchElapsedMs({ baseMs: 500, startedAt: 1000, now: 1500 }) === 1000,
  'ход — base + delta',
)
ok(
  stopwatchElapsedMs({ baseMs: 500, startedAt: 2000, now: 1500 }) === 500,
  'now раньше start — не уходим в минус',
)

console.log('verify-header-stopwatch: all ok')
