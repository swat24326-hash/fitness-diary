/**
 * Кэш типов колонок pgRest: таблица/колонка из миграции после старта процесса → перечитать,
 * иначе jsonb [] пишется как '{}' (INC-2026-10-14-02).
 * node scripts/verify-pg-udt-cache.mjs
 */
import { compilePgRestQuery } from '../api/_lib/pgRest/buildSql.js'
import { needsUdtReload, specWriteColumns, UDT_RELOAD_MIN_MS } from '../api/_lib/pgRest/udtCache.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else console.log('ok:', msg)
}

const known = new Map([
  ['users.id', 'uuid'],
  ['users.email', 'text'],
])
const later = UDT_RELOAD_MIN_MS + 1

ok(!needsUdtReload(known, 'users', ['id', 'email'], 0, later), 'все поля известны — без перечитывания')
ok(needsUdtReload(known, 'device_health', ['problems'], 0, later), 'новая таблица после старта — перечитать')
ok(needsUdtReload(known, 'users', ['pinned_at'], 0, later), 'новая колонка после старта — перечитать')
ok(!needsUdtReload(known, 'device_health', ['problems'], 0, UDT_RELOAD_MIN_MS - 1), 'не чаще раза в интервал')
ok(!needsUdtReload(known, 'device_health', [], 0, later), 'select без записи — без перечитывания')

ok(
  specWriteColumns({ payload: [{ a: 1 }, { b: 2, a: 3 }] }).join(',') === 'a,b',
  'поля записи из массива строк',
)
ok(specWriteColumns({ payload: { problems: [] } }).join(',') === 'problems', 'поля записи из объекта')
ok(specWriteColumns({ op: 'select' }).length === 0, 'select — нет полей записи')

const spec = { op: 'upsert', table: 'device_health', payload: { problems: [] }, onConflict: 'id' }
const withType = compilePgRestQuery(spec, { udtOf: (c) => (c === 'problems' ? 'jsonb' : null) })
ok(withType.values[0] === '[]' && withType.text.includes('::jsonb'), 'jsonb [] с типом → строка "[]"')
const noType = compilePgRestQuery(spec)
ok(Array.isArray(noType.values[0]), 'без типа массив уходит драйверу как есть (он сделает {})')

if (failed) {
  console.error(`\n${failed} проверок упало`)
  process.exit(1)
}
console.log('\nverify-pg-udt-cache: ok')
