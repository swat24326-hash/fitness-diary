/**
 * R3: план копирования Supabase → Managed PG (порядок по FK, колонки, пачки, сверка).
 * node scripts/verify-r3-data-copy.mjs
 */
import {
  chunkRows,
  countMismatches,
  orderTablesByFk,
  parseContentRangeTotal,
  planR3Copy,
  r3TargetGuardError,
} from '../src/lib/r3DataCopyCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const fks = [
  { from: 'users', to: 'clubs' },
  { from: 'clients', to: 'users' },
  { from: 'clients', to: 'clubs' },
  { from: 'trainings', to: 'clients' },
  { from: 'trainings', to: 'users' },
  { from: 'client_weight_entries', to: 'trainings' },
  { from: 'club_price_lists', to: 'auth.users' },
  { from: 'clubs', to: 'clubs' },
]
const order = orderTablesByFk(['trainings', 'client_weight_entries', 'clients', 'users', 'clubs', 'club_price_lists'], fks)
const pos = (t) => order.indexOf(t)
ok(pos('clubs') < pos('users') && pos('users') < pos('clients'), 'clubs → users → clients')
ok(pos('clients') < pos('trainings') && pos('trainings') < pos('client_weight_entries'), 'clients → trainings → веса')
ok(order.includes('club_price_lists'), 'ссылка на auth.users не ломает порядок')
ok(order.length === 6, 'каждая таблица ровно один раз')

let cycle = null
try {
  orderTablesByFk(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])
} catch (e) {
  cycle = e.message
}
ok(cycle && cycle.includes('Цикл'), 'цикл FK — понятная ошибка, а не молчаливый порядок')

const plan = planR3Copy({
  source: {
    clubs: ['id', 'name', 'legacy_flag'],
    club_sales_daily: ['id', 'club_id', 'revenue', 'profit_day'],
    users: ['id', 'club_id', 'email'],
    some_view: ['x'],
    _schema_migrations: ['name'],
  },
  target: {
    _schema_migrations: { columns: ['name'] },
    clubs: { columns: ['id', 'name'], pk: ['id'] },
    club_sales_daily: { columns: ['id', 'club_id', 'revenue', 'profit_day'], generated: ['profit_day'], pk: ['id'] },
    users: { columns: ['id', 'club_id', 'email', 'password_hash'], pk: ['id'] },
    homework_presets: { columns: ['id'], pk: ['id'] },
  },
  fks: [{ from: 'users', to: 'clubs' }, { from: 'club_sales_daily', to: 'clubs' }],
})
const tables = plan.copy.map((c) => c.table)
ok(!tables.includes('_schema_migrations'), 'служебная таблица миграций не копируется')
ok(tables.indexOf('clubs') < tables.indexOf('users'), 'в плане родитель раньше ребёнка')
ok(!plan.copy.find((c) => c.table === 'club_sales_daily').columns.includes('profit_day'), 'генерируемая колонка не вставляется')
ok(!plan.copy.find((c) => c.table === 'users').columns.includes('password_hash'), 'колонки только цели не читаются из облака')
ok(plan.targetOnlyColumns.users?.includes('password_hash'), 'колонки только цели показаны в плане')
ok(plan.sourceOnlyColumns.clubs?.includes('legacy_flag'), 'колонки только облака показаны в плане')
ok(plan.missingOnTarget.includes('some_view') && !plan.missingOnTarget.includes('_schema_migrations'), 'таблицы облака без цели — в отчёте')
ok(plan.missingOnSource.includes('homework_presets') && !tables.includes('homework_presets'), 'пустая в облаке таблица не копируется')
ok(plan.copy.find((c) => c.table === 'clubs').order[0] === 'id', 'постраничное чтение по первичному ключу')

const chunks = chunkRows(Array.from({ length: 1201 }, (_, i) => ({ i })), { maxRows: 500 })
ok(chunks.length === 3 && chunks[2].length === 201, 'пачки по 500 строк')
const big = chunkRows([{ s: 'x'.repeat(900) }, { s: 'x'.repeat(900) }, { s: 'x'.repeat(900) }], { maxBytes: 2000 })
ok(big.length === 2, 'пачка режется по объёму JSON')
ok(chunkRows([]).length === 0, 'пустая таблица — ноль вставок')

ok(parseContentRangeTotal('0-0/1234') === 1234, 'Content-Range 0-0/1234')
ok(parseContentRangeTotal('*/0') === 0, 'Content-Range */0')
ok(parseContentRangeTotal('') === null, 'без Content-Range — null, не 0')

const mm = countMismatches({ clubs: 2, trainings: 10 }, { clubs: 2, trainings: 9 })
ok(mm.length === 1 && mm[0].table === 'trainings', 'расхождение counts находится')
ok(countMismatches({ clubs: 0 }, {}).length === 1, 'нет строки в цели — расхождение')

ok(r3TargetGuardError('') !== null, 'пустой DATABASE_URL — ошибка')
ok(r3TargetGuardError('postgres://u:p@db.abc.supabase.co:5432/postgres') !== null, 'цель Supabase — запрет')
ok(r3TargetGuardError('postgres://u:p@rc1d.mdb.yandexcloud.net:6432/fd') === null, 'Managed PG — ок')

if (failed) {
  console.error(`verify-r3-data-copy: ${failed} fail`)
  process.exit(1)
}
console.log('verify-r3-data-copy: ok')
