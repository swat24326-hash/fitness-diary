/**
 * Скорость тяжёлых API на проде по журналу ВМ (строки `[api-timing]`).
 *   ssh … 'sudo journalctl -u os-hybrid --since -24h --no-pager | grep api-timing' | node scripts/api-timing-report.mjs
 * Размер — тело JSON до сжатия Caddy.
 */
import { summarizeTimingLines } from '../api/_lib/portableTimingLog.js'

let input = ''
for await (const chunk of process.stdin) input += chunk
const rows = summarizeTimingLines(input.split('\n'))
if (!rows.length) {
  console.log('строк [api-timing] нет — метрика ещё не набралась или не выкачена')
  process.exit(0)
}
console.log('маршрут | запросов | p50 мс | p95 мс | max мс | средн. КБ | max КБ')
for (const r of rows) console.log(`${r.route} | ${r.count} | ${r.p50} | ${r.p95} | ${r.max} | ${r.avgKb} | ${r.maxKb}`)
