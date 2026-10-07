/**
 * Метрика скорости API: какие ответы пишем, что в строке нет данных, отчёт p50/p95.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  formatPortableTimingLog,
  shouldLogPortableTiming,
  summarizeTimingLines,
  timingRouteLabel,
} from '../api/_lib/portableTimingLog.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

console.log('что пишем')
ok(shouldLogPortableTiming('/api/trainer-pull', 200), 'trainer-pull 200')
ok(shouldLogPortableTiming('/api/push-records', 201), 'push-records 2xx')
ok(!shouldLogPortableTiming('/api/trainer-pull', 401), 'ошибки — в [api], не в метрике')
ok(!shouldLogPortableTiming('/api/health', 200), 'health не пишем')
ok(!shouldLogPortableTiming('/assets/index.js', 200), 'статику не пишем')

console.log('строка')
ok(timingRouteLabel('/api/admin-data', '?action=club-stats&club_id=x') === '/api/admin-data:club-stats', 'action admin-data в маршруте')
ok(timingRouteLabel('/api/admin-data', '?action=../../etc') === '/api/admin-data', 'мусорный action не пишем')
ok(timingRouteLabel('/api/trainer-pull', '?since=2026') === '/api/trainer-pull', 'query прочих путей не пишем')
const line = formatPortableTimingLog({ method: 'GET', route: '/api/trainer-pull', status: 200, ms: 834.6, bytes: 421_000, userId: null })
ok(line === '[api-timing] GET /api/trainer-pull 200 835ms 411KB', 'формат строки')

console.log('отчёт')
const sample = [
  ...[100, 200, 300, 400, 500, 600, 700, 800, 900, 5000].map((ms) =>
    formatPortableTimingLog({ method: 'GET', route: '/api/trainer-pull', status: 200, ms, bytes: 2048 }),
  ),
  formatPortableTimingLog({ method: 'POST', route: '/api/push-records', status: 200, ms: 50, bytes: 512 }),
  'Oct 07 os-hybrid npm[1]: [api] GET /api/trainer-pull 401 3ms',
]
const rep = summarizeTimingLines(sample)
const pull = rep.find((r) => r.route === 'GET /api/trainer-pull')
ok(pull?.count === 10 && pull.p50 === 600 && pull.p95 === 5000 && pull.max === 5000, 'p50 / p95 / max')
ok(pull?.avgKb === 2, 'средний размер')
ok(rep[0].route === 'GET /api/trainer-pull', 'сортировка по p95 — медленное сверху')
ok(rep.length === 2, 'строки ошибок [api] в отчёт не попадают')

console.log('wiring')
const host = readFileSync(fileURLToPath(new URL('../server/portableApiHost.js', import.meta.url)), 'utf8')
ok(/formatPortableTimingLog\(/.test(host) && /countResponseBytes\(res/.test(host), 'сервер пишет метрику и считает байты')

if (failed) {
  console.error(`\nverify-api-timing-log: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-api-timing-log: ok')
