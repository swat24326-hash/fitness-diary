/**
 * /rest/v1 нашего сервера: настоящие запросы supabase-js (перехват fetch) → разбор → SQL → ответ.
 * Без базы и сети. node scripts/verify-pg-rest-v1.mjs
 */
import { PostgrestClient } from '@supabase/postgrest-js'
import { compilePgRestQuery } from '../api/_lib/pgRest/buildSql.js'
import { parsePreferHeader, parseRestV1Request, stripHiddenColumns } from '../api/_lib/pgRest/restV1Parse.js'
import { restV1ContentRange, restV1ErrorFromPg, shapeRestV1Response } from '../api/_lib/pgRest/restV1Shape.js'
import { buildRlsClaims, RLS_DB_ROLE } from '../api/_lib/pgRest/rlsTx.js'
import { isRestV1Enabled } from '../api/_lib/restV1Handler.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

/** Прогоняет билдер supabase-js и возвращает то, что увидел бы наш сервер. */
async function capture(build) {
  let seen = null
  const fetch = async (url, init) => {
    const u = new URL(url)
    const headers = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    seen = {
      method: init?.method ?? 'GET',
      table: u.pathname.split('/').pop(),
      params: u.searchParams,
      headers,
      body: init?.body ? JSON.parse(init.body) : undefined,
    }
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const client = new PostgrestClient('http://host/rest/v1', { fetch })
  await build(client)
  return seen
}

function compile(req, udtOf) {
  const parsed = parseRestV1Request(req)
  if (parsed.error) return { parsed, compiled: null }
  return { parsed, compiled: compilePgRestQuery(parsed.spec, udtOf ? { udtOf } : undefined) }
}

// --- select + фильтры + order + range
{
  const req = await capture((c) =>
    c
      .from('clients')
      .select('id, name, club_id')
      .eq('club_id', 'c1')
      .neq('status', 'archived')
      .in('trainer_id', ['t1', 't,2'])
      .ilike('name', '%иван%')
      .not('phone', 'is', null)
      .order('name', { ascending: true })
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(10, 19),
  )
  const { parsed, compiled } = compile(req)
  ok(!parsed.error, 'select parses')
  ok(parsed.spec.op === 'select' && parsed.spec.columns === 'id,name,club_id', 'select columns (без пробелов)')
  ok(parsed.spec.filters.length === 5, 'five filters')
  ok(parsed.spec.offset === 10 && parsed.spec.limit === 10, 'range → offset/limit')
  ok(parsed.spec.orders[1].ascending === false && parsed.spec.orders[1].nullsFirst === false, 'order desc nullslast')
  ok(
    compiled.text ===
      'SELECT "id", "name", "club_id" FROM "public"."clients" WHERE "club_id" = $1 AND "status" <> $2 AND "trainer_id" IN ($3, $4) AND "name" ILIKE $5 AND NOT ("phone" IS NULL) ORDER BY "name" ASC, "created_at" DESC NULLS LAST LIMIT 10 OFFSET 10',
    'select SQL',
  )
  ok(compiled.values[3] === 't,2', 'in: запятая в кавычках не режет значение')
  ok(!parsed.single, 'array by default')
}

// --- or()
{
  const req = await capture((c) => c.from('clients').select('id').or('name.ilike.%a%,phone.ilike.%a%'))
  const { compiled } = compile(req)
  ok(compiled.text.includes('("name" ILIKE $1 OR "phone" ILIKE $2)'), 'or() → OR group')
}

// --- single / maybeSingle
{
  const single = await capture((c) => c.from('users').select('role').eq('id', 'u1').single())
  ok(parseRestV1Request(single).single === true, 'single → Accept object')
  const maybe = await capture((c) => c.from('users').select('role').eq('id', 'u1').maybeSingle())
  ok(parseRestV1Request(maybe).single === false, 'maybeSingle решает клиент (массив)')
}

// --- count / head
{
  const head = await capture((c) => c.from('users').select('id', { count: 'exact', head: true }).eq('club_id', 'c1'))
  const { parsed, compiled } = compile(head)
  ok(parsed.method === 'HEAD' && parsed.spec.head, 'head request')
  ok(compiled.text === null && compiled.countText.startsWith('SELECT count(*)::int'), 'head → только count')
  const withCount = await capture((c) => c.from('clients').select('id', { count: 'exact' }).limit(0))
  const c2 = compile(withCount)
  ok(c2.parsed.spec.count === 'exact' && c2.compiled.countText, 'count=exact + data')
}

// --- upsert + select + single
{
  const req = await capture((c) =>
    c
      .from('club_sales_daily')
      .upsert({ club_id: 'c1', report_date: '2026-09-28', amount: 5 }, { onConflict: 'club_id,report_date' })
      .select('id, amount')
      .single(),
  )
  const { parsed, compiled } = compile(req, (col) => (col === 'report_date' ? 'date' : null))
  ok(parsed.spec.op === 'upsert' && parsed.spec.onConflict === 'club_id,report_date', 'upsert on_conflict')
  ok(parsed.spec.returning && parsed.single, 'upsert returning + single')
  ok(
    compiled.text.includes('ON CONFLICT ("club_id", "report_date") DO UPDATE SET') &&
      compiled.text.endsWith('RETURNING "id", "amount"'),
    'upsert SQL',
  )
  ok(compiled.text.includes('$2::date'), 'date cast')
}

// --- insert без select → minimal; массив с missing=default
{
  const req = await capture((c) => c.from('outreach_log').insert([{ a: 1 }, { a: 2, b: 3 }], { defaultToNull: false }))
  const { parsed, compiled } = compile(req)
  ok(parsed.spec.op === 'insert' && !parsed.spec.returning, 'insert без select → minimal')
  ok(parsed.spec.missingDefault, 'missing=default распознан')
  ok(compiled.text.includes('($1, DEFAULT), ($2, $3)'), 'пропущенное поле → DEFAULT')
  ok(shapeRestV1Response(parsed, [], null).status === 201, 'insert minimal → 201')
}

// --- update / delete
{
  const upd = await capture((c) => c.from('users').update({ club_id: 'c2' }).eq('id', 't1').in('role', ['trainer']))
  const u = compile(upd)
  ok(u.compiled.text.startsWith('UPDATE "public"."users" SET "club_id" = $1 WHERE "id" = $2'), 'update SQL')
  ok(shapeRestV1Response(u.parsed, [], null).status === 204, 'update minimal → 204')
  const del = await capture((c) => c.from('trainer_schedule_entries').delete().eq('id', 'x'))
  ok(compile(del).compiled.text === 'DELETE FROM "public"."trainer_schedule_entries" WHERE "id" = $1', 'delete SQL')
  const delAll = await capture((c) => c.from('clients').delete())
  ok(compile(delAll).compiled.error, 'delete без фильтра отклонён')
}

// --- скрытая колонка users.password_hash
{
  const sel = await capture((c) => c.from('users').select('id, password_hash'))
  ok(parseRestV1Request(sel).error?.status === 403, 'select password_hash → 403')
  const filt = await capture((c) => c.from('users').select('id').like('password_hash', 'scrypt%'))
  ok(parseRestV1Request(filt).error?.status === 403, 'фильтр по password_hash → 403')
  const orFilt = await capture((c) => c.from('users').select('id').or('password_hash.like.s*,id.eq.1'))
  ok(parseRestV1Request(orFilt).error?.status === 403, 'or() по password_hash → 403')
  const write = await capture((c) => c.from('users').update({ Password_Hash: 'x' }).eq('id', 'u1'))
  ok(parseRestV1Request(write).error?.status === 403, 'запись password_hash → 403')
  const stripped = stripHiddenColumns('users', [{ id: 1, password_hash: 'scrypt$…' }])
  ok(!('password_hash' in stripped[0]) && stripped[0].id === 1, 'select=* на users вырезает хеш')
  ok(stripHiddenColumns('clients', [{ password_hash: 1 }])[0].password_hash === 1, 'другие таблицы не трогаем')
}

// --- ошибки разбора
{
  ok(parseRestV1Request({ method: 'PUT', table: 't', params: new URLSearchParams(), headers: {} }).error?.status === 405, 'PUT → 405')
  ok(
    parseRestV1Request({ method: 'GET', table: 't', params: new URLSearchParams('a=zz.1'), headers: {} }).error?.status === 400,
    'неизвестный оператор → 400',
  )
  ok(
    parseRestV1Request({ method: 'GET', table: 't', params: new URLSearchParams(), headers: { 'accept-profile': 'auth' } }).error,
    'чужая схема отклонена',
  )
  ok(
    parseRestV1Request({ method: 'POST', table: 't', params: new URLSearchParams(), headers: { prefer: 'resolution=merge-duplicates' }, body: {} }).error,
    'upsert без on_conflict отклонён',
  )
  const nested = parseRestV1Request({ method: 'GET', table: 't', params: new URLSearchParams('select=id,clubs(name)'), headers: {} })
  ok(compilePgRestQuery(nested.spec).error, 'вложенный select отклонён')
}

// --- ответ
{
  const parsed = { spec: { op: 'select', offset: 0, returning: false, head: false }, single: true }
  ok(shapeRestV1Response(parsed, [], null).status === 406, 'single без строк → 406')
  ok(shapeRestV1Response(parsed, [], null).body.code === 'PGRST116', 'PGRST116')
  ok(shapeRestV1Response(parsed, [{ a: 1 }], null).body.a === 1, 'single → объект')
  ok(restV1ContentRange(10, 5, 120) === '10-14/120', 'Content-Range страница')
  ok(restV1ContentRange(0, 0, 7) === '*/7', 'Content-Range пусто')
  ok(restV1ContentRange(null, 3, null) === '0-2/*', 'Content-Range без count')
  ok(restV1ErrorFromPg({ code: '42501', message: 'rls' }).status === 403, 'RLS отказ → 403')
  ok(restV1ErrorFromPg({ code: '23505' }).status === 409, 'дубль → 409')
  ok(parsePreferHeader('return=representation, count=exact').count === 'exact', 'Prefer разбор')
}

// --- RLS claims и выключатель
{
  const claims = buildRlsClaims({ id: 'u-1', email: 'a@b.c' })
  ok(claims.sub === 'u-1' && claims.role === RLS_DB_ROLE && claims.email === 'a@b.c', 'claims для auth.uid()/auth.jwt()')
  const keep = { a: process.env.AUTH_PROVIDER, d: process.env.DATA_BACKEND }
  process.env.AUTH_PROVIDER = 'own'
  delete process.env.DATA_BACKEND
  ok(!isRestV1Enabled(), 'только own без pg → выключено')
  process.env.DATA_BACKEND = 'pg'
  ok(isRestV1Enabled(), 'own + pg → включено')
  delete process.env.AUTH_PROVIDER
  ok(!isRestV1Enabled(), 'только pg без own → выключено')
  if (keep.a === undefined) delete process.env.AUTH_PROVIDER
  else process.env.AUTH_PROVIDER = keep.a
  if (keep.d === undefined) delete process.env.DATA_BACKEND
  else process.env.DATA_BACKEND = keep.d
}

if (failed) process.exit(1)
console.log('verify-pg-rest-v1: all passed')
