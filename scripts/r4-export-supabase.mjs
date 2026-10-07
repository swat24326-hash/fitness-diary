/**
 * R4: финальная выгрузка старого Supabase перед паузой / удалением проекта.
 * Только чтение облака (REST, service role с ВМ) → gzip NDJSON по таблице в каталог на ВМ (РФ).
 * Сверка: число строк облако / файл / Managed PG. В stdout — только имена таблиц и числа.
 *
 *   sudo install -d -m 700 -o osapp /var/backups/fitness-diary/r4-supabase-$(date +%F)
 *   sudo bash scripts/r2-vm-db-run.sh scripts/r4-export-supabase.mjs /var/backups/fitness-diary/r4-supabase-<дата>
 */
import { createWriteStream, chmodSync } from 'node:fs'
import { once } from 'node:events'
import { createGzip } from 'node:zlib'
import pg from 'pg'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'
import { parseContentRangeTotal } from '../src/lib/r3DataCopyCore.js'

const PAGE = 1000

function env(name) {
  const v = String(process.env[name] ?? '').trim()
  if (!v) throw new Error(`Нет ${name} в окружении (r2-vm-db-run.sh берёт из .env ВМ).`)
  return v
}

function cloud() {
  const url = env('SUPABASE_URL').replace(/\/+$/, '')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  // Supabase из РФ рвёт соединения (RUNBOOK §4c) — повтор с паузой, иначе выгрузка падает на середине.
  const get = async (path, extra = {}, method = 'GET') => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const res = await fetch(`${url}${path}`, { method, headers: { ...headers, ...extra } })
        if (res.ok) return res
        if (res.status < 500 || attempt >= 5) throw new Error(`Облако ${method} ${path.split('?')[0]}: HTTP ${res.status}`)
      } catch (e) {
        if (attempt >= 5 || /^Облако /.test(String(e?.message))) throw e
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  return {
    async tables() {
      const spec = await (await get('/rest/v1/', { Accept: 'application/openapi+json' })).json()
      return Object.keys(spec.definitions ?? {}).sort()
    },
    async count(table) {
      const res = await get(`/rest/v1/${table}?select=*&limit=1`, { Prefer: 'count=exact' }, 'HEAD')
      return parseContentRangeTotal(res.headers.get('content-range'))
    },
    async *pages(table) {
      for (let offset = 0; ; offset += PAGE) {
        const rows = await (await get(`/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}`)).json()
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

async function writeNdjson(path, rowsIter) {
  const gz = createGzip()
  const file = createWriteStream(path, { mode: 0o600 })
  gz.pipe(file)
  let n = 0
  for await (const rows of rowsIter) {
    for (const r of rows) {
      if (!gz.write(`${JSON.stringify(r)}\n`)) await once(gz, 'drain')
      n += 1
    }
  }
  gz.end()
  await once(file, 'finish')
  chmodSync(path, 0o600)
  return n
}

async function main() {
  const out = String(process.argv[2] ?? '').replace(/\/+$/, '')
  if (!out.startsWith('/var/backups/')) throw new Error('Укажите каталог в /var/backups/… (создать заранее, mode 700, владелец osapp)')

  const databaseUrl = env('DATABASE_URL')
  const ssl = pgClientSslOption(databaseUrl)
  const db = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await db.connect()
  const src = cloud()
  const bad = []
  try {
    const tables = await src.tables()
    console.log(`таблиц/видов в облаке: ${tables.length}`)
    for (const t of tables) {
      const cloudN = await src.count(t).catch(() => null)
      const fileN = await writeNdjson(`${out}/${t}.ndjson.gz`, src.pages(t))
      let pgN = '—'
      try {
        pgN = Number((await db.query(`select count(*)::int n from public."${t.replace(/"/g, '""')}"`)).rows[0].n)
      } catch {
        pgN = 'нет таблицы'
      }
      const mark = cloudN != null && cloudN !== fileN ? '  ✗ файл ≠ облако' : ''
      if (mark) bad.push(t)
      console.log(`  ${t}: облако ${cloudN ?? '?'}, файл ${fileN}, Managed PG ${pgN}${mark}`)
    }
    const users = await src.authUsers()
    const authN = await writeNdjson(`${out}/_auth_users.ndjson.gz`, [users])
    console.log(`  auth.users: ${authN}`)
  } finally {
    await db.end()
  }
  if (bad.length) {
    console.error(`выгрузка неполная: ${bad.join(', ')}`)
    process.exit(1)
  }
  console.log(`готово: ${out}`)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
