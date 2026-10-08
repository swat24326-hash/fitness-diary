/**
 * node scripts/verify-batch-core.mjs — пачки для рассылок и размер пула PG (docs/CAPACITY_PLAN.md, этап A).
 */
import { IN_CHUNK, loadInChunks, runWithConcurrency } from '../api/_lib/batchCore.js'
import { PG_POOL_MAX_DEFAULT, pgPoolMaxFromEnv } from '../api/_lib/pgRest/poolConfig.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const ids = Array.from({ length: 1001 }, (_, i) => i)
const parts = []
const loaded = await loadInChunks(ids, async (part) => {
  parts.push(part.length)
  return part.map((x) => x * 2)
})
ok(parts.length === 3 && parts.every((n) => n <= IN_CHUNK), `1001 id → 3 пачки по ≤${IN_CHUNK} (${parts.join(', ')})`)
ok(loaded.length === 1001 && loaded[1000] === 2000, 'все строки собраны по порядку')
ok((await loadInChunks([], async () => ['x'])).length === 0, 'пустой список — ни одного запроса')

let active = 0
let peak = 0
const done = []
await runWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 8, async (i) => {
  active += 1
  peak = Math.max(peak, active)
  await new Promise((r) => setTimeout(r, 2))
  done.push(i)
  active -= 1
})
ok(done.length === 30 && new Set(done).size === 30, 'каждый получатель обработан ровно один раз')
ok(peak <= 8 && peak > 1, `не больше 8 потоков одновременно (пик ${peak})`)
let calls = 0
await runWithConcurrency([], 8, async () => {
  calls += 1
})
ok(calls === 0, 'пустой план — ничего не делаем')

ok(pgPoolMaxFromEnv(undefined) === PG_POOL_MAX_DEFAULT, 'PG_POOL_MAX не задан → 8')
ok(pgPoolMaxFromEnv('20') === 20, 'PG_POOL_MAX=20 → 20')
ok(pgPoolMaxFromEnv(' 12 ') === 12, 'пробелы вокруг числа не мешают')
ok(pgPoolMaxFromEnv('abc') === PG_POOL_MAX_DEFAULT, 'мусор → 8, сервер не падает')
ok(pgPoolMaxFromEnv('1') === PG_POOL_MAX_DEFAULT, 'меньше 2 → 8 (одно соединение задушит API)')
ok(pgPoolMaxFromEnv('7.5') === PG_POOL_MAX_DEFAULT, 'дробь → 8')
ok(pgPoolMaxFromEnv('500') === 40, 'больше 40 → 40 (лимит Managed PG)')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-batch-core: all passed')
