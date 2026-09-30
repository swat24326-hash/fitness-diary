/**
 * R3 (ночь переезда): данные клуба Supabase → Managed PG одной транзакцией.
 * Читает облако через REST под service role (ключ с ВМ, не печатается), пишет в DATABASE_URL.
 * Схема цели — наши миграции; служебная _schema_migrations не трогается.
 *
 *   sudo bash scripts/r2-vm-db-run.sh scripts/r3-copy-data.mjs                 # план и counts, база не меняется
 *   sudo bash scripts/r2-vm-db-run.sh scripts/r3-copy-data.mjs --apply         # очистить цель и перенести
 *   … --allow-missing=t1,t2   если в облаке есть таблицы со строками, которых нет в цели (осознанно)
 *
 * До --apply: Sync на всех планшетах до пустой очереди. После: r3-import-auth-hashes.mjs (пароли).
 * В stdout — только имена таблиц и числа.
 */
import pg from 'pg'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'
import {
  R3_RELAXED_UNIQUE_INDEXES,
  R3_SKIP_TABLES,
  chunkRows,
  countMismatches,
  parseContentRangeTotal,
  planR3Copy,
  r3TargetGuardError,
} from '../src/lib/r3DataCopyCore.js'

const PAGE = 1000
const q = (id) => `"${String(id).replace(/"/g, '""')}"`

function env(name) {
  const v = String(process.env[name] ?? '').trim()
  if (!v) throw new Error(`Нет ${name} в окружении (r2-vm-db-run.sh берёт из .env ВМ).`)
  return v
}

function cloud() {
  const url = env('SUPABASE_URL').replace(/\/+$/, '')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const get = async (path, extra = {}, method = 'GET') => {
    const res = await fetch(`${url}${path}`, { method, headers: { ...headers, ...extra } })
    if (!res.ok) throw new Error(`Облако ${method} ${path.split('?')[0]}: HTTP ${res.status}`)
    return res
  }
  return {
    async tables() {
      const spec = await (await get('/rest/v1/', { Accept: 'application/openapi+json' })).json()
      const out = {}
      for (const [name, def] of Object.entries(spec.definitions ?? {})) out[name] = Object.keys(def.properties ?? {})
      return out
    },
    async count(table) {
      const res = await get(`/rest/v1/${table}?select=*&limit=1`, { Prefer: 'count=exact' }, 'HEAD')
      const n = parseContentRangeTotal(res.headers.get('content-range'))
      if (n == null) throw new Error(`Облако не вернуло число строк для ${table}`)
      return n
    },
    async *pages(table, columns, order) {
      const sel = columns.map(encodeURIComponent).join(',')
      const ord = order.map((c) => `${encodeURIComponent(c)}.asc`).join(',')
      for (let offset = 0; ; offset += PAGE) {
        const rows = await (await get(`/rest/v1/${table}?select=${sel}&order=${ord}&limit=${PAGE}&offset=${offset}`)).json()
        if (rows.length) yield rows
        if (rows.length < PAGE) return
      }
    },
    async authUsers() {
      const all = []
      for (let page = 1; ; page += 1) {
        const body = await (await get(`/auth/v1/admin/users?page=${page}&per_page=${PAGE}`)).json()
        const users = body.users ?? []
        all.push(...users)
        if (users.length < PAGE) return all
      }
    },
  }
}

async function targetCatalog(db) {
  const skip = R3_SKIP_TABLES
  const cols = await db.query(
    `select table_name t, column_name c, is_generated = 'ALWAYS' gen
       from information_schema.columns c
       join information_schema.tables using (table_schema, table_name)
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name, ordinal_position`,
  )
  const target = {}
  for (const r of cols.rows) {
    if (skip.includes(r.t)) continue
    target[r.t] ??= { columns: [], generated: [], pk: [] }
    target[r.t].columns.push(r.c)
    if (r.gen) target[r.t].generated.push(r.c)
  }
  const pks = await db.query(
    `select tc.table_name t, kcu.column_name c
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu using (constraint_schema, constraint_name)
      where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position`,
  )
  for (const r of pks.rows) target[r.t]?.pk.push(r.c)
  const fk = await db.query(
    `select conrelid::regclass::text a, confrelid::regclass::text b
       from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`,
  )
  const strip = (s) => s.replace(/^public\./, '').replace(/"/g, '')
  const fks = fk.rows.map((r) => ({ from: strip(r.a), to: strip(r.b) }))
  const trg = await db.query(
    `select distinct tgrelid::regclass::text t from pg_trigger
      where not tgisinternal and tgrelid::regclass::text not like 'auth.%'`,
  )
  return { target, fks, triggerTables: trg.rows.map((r) => strip(r.t)) }
}

async function countTarget(db, tables) {
  const out = {}
  for (const t of tables) out[t] = Number((await db.query(`select count(*)::int n from public.${q(t)}`)).rows[0].n)
  return out
}

async function main() {
  const apply = process.argv.includes('--apply')
  const allowArg = process.argv.find((a) => a.startsWith('--allow-missing='))
  const allowMissing = new Set(allowArg ? allowArg.split('=')[1].split(',').filter(Boolean) : [])
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  const guard = r3TargetGuardError(databaseUrl)
  if (guard) throw new Error(guard)

  const src = cloud()
  const ssl = pgClientSslOption(databaseUrl)
  const db = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await db.connect()
  try {
    const { target, fks, triggerTables } = await targetCatalog(db)
    const source = await src.tables()
    const plan = planR3Copy({ source, target, fks })

    const sourceCounts = {}
    for (const { table } of plan.copy) sourceCounts[table] = await src.count(table)
    const before = await countTarget(db, plan.copy.map((c) => c.table))
    const authUsers = await src.authUsers()

    console.log(`таблиц к переносу: ${plan.copy.length}; пользователей Auth: ${authUsers.length}`)
    for (const { table } of plan.copy) console.log(`  ${table}: облако ${sourceCounts[table]}, цель сейчас ${before[table]}`)
    if (plan.missingOnSource.length) console.log(`в облаке нет (останутся пустыми): ${plan.missingOnSource.join(', ')}`)
    for (const [t, c] of Object.entries(plan.sourceOnlyColumns)) console.log(`  колонки только в облаке, не переносятся: ${t}: ${c.join(', ')}`)
    for (const [t, c] of Object.entries(plan.targetOnlyColumns)) console.log(`  колонки только в цели (NULL/по умолчанию): ${t}: ${c.join(', ')}`)

    const blocking = []
    for (const t of plan.missingOnTarget) {
      let n = null
      try {
        n = await src.count(t)
      } catch {
        n = null
      }
      console.log(`  в цели нет таблицы/вида: ${t} (строк в облаке: ${n ?? '?'})`)
      if (n && !allowMissing.has(t)) blocking.push(t)
    }

    if (!apply) {
      console.log('план показан, база не менялась; для переноса добавьте --apply')
      return
    }
    if (blocking.length) throw new Error(`Есть данные в облаке без таблицы в цели: ${blocking.join(', ')}. Проверьте и при необходимости --allow-missing=…`)

    const started = Date.now()
    await db.query('BEGIN')
    try {
      const all = Object.keys(target).map((t) => `public.${q(t)}`)
      await db.query(`TRUNCATE ${all.join(', ')}, auth.users CASCADE`)
      for (const t of triggerTables) await db.query(`ALTER TABLE public.${q(t)} DISABLE TRIGGER USER`)
      const relaxed = (
        await db.query(
          `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname = any($1)`,
          [R3_RELAXED_UNIQUE_INDEXES],
        )
      ).rows
      for (const r of relaxed) await db.query(`DROP INDEX public.${q(r.indexname)}`)

      const authRows = authUsers.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        raw_user_meta_data: u.user_metadata ?? u.raw_user_meta_data ?? {},
        created_at: u.created_at ?? null,
        updated_at: u.updated_at ?? null,
      }))
      for (const batch of chunkRows(authRows)) {
        await db.query(
          `insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
           select id, email, coalesce(raw_user_meta_data, '{}'::jsonb), coalesce(created_at, now()), coalesce(updated_at, now())
             from json_populate_recordset(null::auth.users, $1::json)`,
          [JSON.stringify(batch)],
        )
      }

      for (const { table, columns, order } of plan.copy) {
        const cols = columns.map(q).join(', ')
        let n = 0
        for await (const rows of src.pages(table, columns, order)) {
          for (const batch of chunkRows(rows)) {
            await db.query(
              `insert into public.${q(table)} (${cols}) select ${cols} from json_populate_recordset(null::public.${q(table)}, $1::json)`,
              [JSON.stringify(batch)],
            )
          }
          n += rows.length
        }
        console.log(`  ${table}: +${n}`)
      }

      for (const t of triggerTables) await db.query(`ALTER TABLE public.${q(t)} ENABLE TRIGGER USER`)
      for (const r of relaxed) {
        await db.query('SAVEPOINT relaxed_index')
        try {
          await db.query(r.indexdef)
          await db.query('RELEASE SAVEPOINT relaxed_index')
        } catch {
          await db.query('ROLLBACK TO SAVEPOINT relaxed_index')
          console.log(`  индекс ${r.indexname} не возвращён: в данных облака есть дубли (как на prod), разобрать после переезда`)
        }
      }
      const after = await countTarget(db, plan.copy.map((c) => c.table))
      const authAfter = Number((await db.query('select count(*)::int n from auth.users')).rows[0].n)
      const bad = countMismatches(sourceCounts, after)
      if (authAfter !== authUsers.length) bad.push({ table: 'auth.users', source: authUsers.length, target: authAfter })
      if (bad.length) {
        for (const b of bad) console.error(`  расхождение ${b.table}: облако ${b.source}, цель ${b.target}`)
        throw new Error('Сверка не сошлась — откат, цель не изменена.')
      }
      await db.query('COMMIT')
      console.log(`готово за ${Math.round((Date.now() - started) / 1000)} с; сверка counts ок. Дальше: r3-import-auth-hashes.mjs`)
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      throw e
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
