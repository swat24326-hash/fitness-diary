/**
 * Data-port: SQL supabase-js → Postgres без живой базы.
 * node scripts/verify-pg-rest.mjs
 */
import { isPgDataBackend, pgDataBackendEnvError, pgSslCaPath } from '../api/_lib/pgRest/backend.js'
import { compilePgRestQuery } from '../api/_lib/pgRest/buildSql.js'
import { pgNumberMaybe, pgTimestamptzToIso } from '../api/_lib/pgRest/pgValues.js'
import { createPgRestClient } from '../api/_lib/pgRest/query.js'
import { shapePgRestResult } from '../api/_lib/pgRest/shapeResult.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

function sqlOf(query, udtOf) {
  return compilePgRestQuery(query.spec, udtOf ? { udtOf } : undefined)
}

const users = createPgRestClient()
  .from('users')
  .select('id, email')
  .eq('id', 'abc')
  .maybeSingle()
const usersSql = sqlOf(users)
ok(usersSql.text === 'SELECT "id", "email" FROM "public"."users" WHERE "id" = $1', 'select eq')
ok(usersSql.values[0] === 'abc' && !usersSql.text.includes('abc'), 'значение только в параметре')
ok(users.spec.single === 'maybeSingle', 'maybeSingle на цепочке')

const uuidSql = sqlOf(
  createPgRestClient().from('users').select('id').eq('id', 'abc'),
  (col) => (col === 'id' ? 'uuid' : null),
)
ok(uuidSql.text === 'SELECT "id" FROM "public"."users" WHERE "id" = $1::uuid', 'uuid каст')

const ilike = sqlOf(createPgRestClient().from('users').select('email').ilike('email', '%admin@fit-city.ru%'))
ok(ilike.text.includes('"email" ILIKE $1'), 'ilike')
ok(ilike.values[0] === '%admin@fit-city.ru%', 'шаблон ilike в параметре')

const archived = sqlOf(
  createPgRestClient().from('clients').select('id').is('archived_at', null).order('name', { ascending: true }).range(0, 49),
)
ok(
  archived.text ===
    'SELECT "id" FROM "public"."clients" WHERE "archived_at" IS NULL ORDER BY "name" ASC LIMIT 50 OFFSET 0',
  'is null + страница',
)

const archivedOnly = sqlOf(createPgRestClient().from('clients').select('id').not('archived_at', 'is', null))
ok(archivedOnly.text.endsWith('WHERE NOT ("archived_at" IS NULL)'), 'not is null')

const roles = sqlOf(createPgRestClient().from('users').select('id').or('role.eq.trainer,role.eq.тренер'))
ok(
  roles.text === 'SELECT "id" FROM "public"."users" WHERE ("role" = $1 OR "role" = $2)',
  'or eq',
)
ok(roles.values[1] === 'тренер' && !roles.text.includes('тренер'), 'or не склеивает значение в SQL')

const pnk = sqlOf(
  createPgRestClient()
    .from('clients')
    .select('id')
    .is('archived_at', null)
    .or('lifecycle.eq.pnk,lifecycle.eq.pnk_lost,pnk_won_at.not.is.null,pnk_created_at.not.is.null')
    .order('pnk_created_at', { ascending: false, nullsFirst: false }),
)
ok(pnk.text.includes('"archived_at" IS NULL AND ('), 'pnk: is и or вместе')
ok(pnk.text.includes('NOT ("pnk_won_at" IS NULL)'), 'pnk: not is null')
ok(pnk.text.endsWith('ORDER BY "pnk_created_at" DESC NULLS LAST'), 'nulls last')
ok(pnk.values[0] === 'pnk' && pnk.values[1] === 'pnk_lost', 'pnk значения')

const quotedOr = sqlOf(createPgRestClient().from('users').select('id').or('name.eq."a,b",role.eq.c'))
ok(quotedOr.values[0] === 'a,b' && quotedOr.values[1] === 'c', 'запятая внутри кавычек or')

const emptyIn = sqlOf(createPgRestClient().from('clients').select('id').in('id', []))
ok(emptyIn.text.endsWith('WHERE FALSE'), 'пустой in — ни одной строки')
const inUuid = sqlOf(
  createPgRestClient().from('clients').select('id').in('id', ['a', 'b']),
  (col) => (col === 'id' ? 'uuid' : null),
)
ok(inUuid.text.includes('"id" IN ($1::uuid, $2::uuid)'), 'in uuid')

const dates = sqlOf(
  createPgRestClient().from('trainings').select('*').gte('date', '2026-01-01').lte('date', '2026-01-31').lt('created_at', '2026-02-01'),
  (col) => (col === 'date' ? 'date' : col === 'created_at' ? 'timestamptz' : null),
)
ok(dates.text.includes('"date" >= $1::date'), 'date >=' )
ok(dates.text.includes('"date" <= $2::date'), 'date <=')
ok(dates.text.includes('"created_at" < $3::timestamptz'), 'timestamptz <')

const head = sqlOf(
  createPgRestClient().from('clients').select('id', { count: 'exact', head: true }).eq('trainer_id', 't1'),
)
ok(head.text == null && head.countText === 'SELECT count(*)::int AS _fd_count FROM "public"."clients" WHERE "trainer_id" = $1', 'head count')

const page = sqlOf(
  createPgRestClient().from('trainings').select('*', { count: 'exact' }).order('date', { ascending: false }).order('id', { ascending: false }).range(50, 99),
)
ok(page.text.endsWith('ORDER BY "date" DESC, "id" DESC LIMIT 50 OFFSET 50'), 'вторая страница')
ok(page.countText.startsWith('SELECT count(*)::int AS _fd_count') && !page.countText.includes('ORDER BY'), 'count без order')

const inserted = sqlOf(
  createPgRestClient().from('trainings').insert({ id: 'u1', data: { a: 1 } }).select('id').maybeSingle(),
  (col) => (col === 'id' ? 'uuid' : col === 'data' ? 'jsonb' : null),
)
ok(
  inserted.text === 'INSERT INTO "public"."trainings" ("id", "data") VALUES ($1::uuid, $2::jsonb) RETURNING "id"',
  'insert jsonb + returning',
)
ok(inserted.values[1] === '{"a":1}', 'jsonb сериализован')

const plainInsert = sqlOf(createPgRestClient().from('users').insert({ id: 'u1', name: 'Анна' }))
ok(!plainInsert.text.includes('RETURNING'), 'insert без select не возвращает строку')

const updated = sqlOf(createPgRestClient().from('trainings').update({ status: 'completed' }).eq('id', 'u1'))
ok(updated.text === 'UPDATE "public"."trainings" SET "status" = $1 WHERE "id" = $2', 'update')
ok(compilePgRestQuery({ op: 'update', table: 'trainings', payload: { status: 'x' }, filters: [] }).error, 'update без фильтра')

const removed = sqlOf(
  createPgRestClient().from('users').delete().eq('id', 'u1').in('role', ['trainer', 'тренер']),
)
ok(
  removed.text === 'DELETE FROM "public"."users" WHERE "id" = $1 AND "role" IN ($2, $3)',
  'delete eq + in',
)
ok(compilePgRestQuery({ op: 'delete', table: 'users', filters: [] }).error, 'delete без фильтра')

const up = sqlOf(
  createPgRestClient().from('trainer_pay_profiles').upsert(
    { trainer_id: 't1', on_plan: true },
    { onConflict: 'trainer_id' },
  ),
)
ok(up.text.includes('ON CONFLICT ("trainer_id") DO UPDATE SET "trainer_id" = EXCLUDED."trainer_id"'), 'upsert update')

const snap = sqlOf(
  createPgRestClient().from('club_trainer_pay_month_snapshots').upsert(
    { club_id: 'c1', year: 2026, month: 9 },
    { onConflict: 'club_id,year,month', ignoreDuplicates: true },
  ),
)
ok(snap.text.includes('ON CONFLICT ("club_id", "year", "month") DO NOTHING'), 'upsert ignoreDuplicates')
ok(compilePgRestQuery({ op: 'upsert', table: 'users', payload: { id: '1' }, filters: [] }).error, 'upsert без onConflict')

ok(compilePgRestQuery({ op: 'select', table: 'users;drop', columns: '*', filters: [] }).error, 'имя таблицы')
ok(
  compilePgRestQuery({
    op: 'select',
    table: 'users',
    columns: '*',
    filters: [{ op: 'eq', column: 'id;drop', value: '1' }],
  }).error,
  'имя поля',
)
ok(
  compilePgRestQuery({ op: 'select', table: 'users', columns: 'clients(id)', filters: [] }).error,
  'вложенный select',
)

const none = shapePgRestResult([], { op: 'select', single: 'maybeSingle', count: null }, null)
ok(none.data == null && none.error == null, 'maybeSingle 0 строк')
const one = shapePgRestResult([{ id: '1' }], { op: 'select', single: 'maybeSingle' }, null)
ok(one.data?.id === '1' && one.error == null, 'maybeSingle 1 строка')
const many = shapePgRestResult([{ id: '1' }, { id: '2' }], { op: 'select', single: 'single' }, null)
ok(many.error?.code === 'PGRST116' && many.data == null, 'single несколько строк')
const missing = shapePgRestResult([], { op: 'select', single: 'single' }, null)
ok(missing.error?.code === 'PGRST116', 'single 0 строк')
const headed = shapePgRestResult([], { op: 'select', head: true, count: 'exact' }, 4)
ok(headed.data == null && headed.count === 4, 'head отдаёт count')
const listed = shapePgRestResult([{ id: '1' }], { op: 'select', count: 'exact' }, 12)
ok(listed.data.length === 1 && listed.count === 12, 'страница и полный count')
const minimal = shapePgRestResult([{ id: '1' }], { op: 'insert', returning: false }, null)
ok(minimal.data == null && minimal.error == null, 'insert без returning')

ok(pgTimestamptzToIso('2026-09-28 18:00:00+00') === '2026-09-28T18:00:00.000Z', 'timestamptz → ISO')
ok(pgTimestamptzToIso('2026-09-28 21:00:00.123456+03') === '2026-09-28T18:00:00.123Z', 'timestamptz с зоной +03')
ok(pgNumberMaybe('10.50') === 10.5, 'numeric в число')
ok(pgNumberMaybe('9007199254740993') === '9007199254740993', 'большой int8 остаётся строкой')

const prevBackend = process.env.DATA_BACKEND
const prevUrl = process.env.DATABASE_URL
try {
  delete process.env.DATA_BACKEND
  ok(!isPgDataBackend(), 'без флага это не pg')
  process.env.DATA_BACKEND = 'supabase'
  ok(!isPgDataBackend() && pgDataBackendEnvError() == null, 'supabase — прежний путь')
  process.env.DATA_BACKEND = 'pg'
  delete process.env.DATABASE_URL
  ok(isPgDataBackend() && pgDataBackendEnvError(), 'pg без DATABASE_URL — ошибка')
  process.env.DATABASE_URL = 'postgres://user:secret@db.example:6432/fitness_diary?sslmode=verify-full&sslrootcert=/etc/ssl/yandex/CA.pem'
  ok(pgDataBackendEnvError() == null, 'pg с DATABASE_URL')
  ok(pgSslCaPath(process.env.DATABASE_URL) === '/etc/ssl/yandex/CA.pem', 'путь CA из URL')
  ok(!String(pgSslCaPath(process.env.DATABASE_URL)).includes('secret'), 'CA не содержит пароль')
} finally {
  if (prevBackend == null) delete process.env.DATA_BACKEND
  else process.env.DATA_BACKEND = prevBackend
  if (prevUrl == null) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = prevUrl
}

if (failed) {
  console.error(`verify-pg-rest: ${failed} failed`)
  process.exit(1)
}
console.log('verify-pg-rest: ok')
