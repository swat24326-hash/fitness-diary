/**
 * Тестовый клуб на стенде C2 (Managed PG): клуб, 4 сотрудника со своим хешем пароля, клиенты, абонементы.
 * Прод не трогает: пишет только в DATABASE_URL и только в пустую базу.
 * Пароли генерируются здесь и уходят в файл 0600 (C2_SEED_CREDENTIALS_FILE), в stdout — только логины.
 *
 * Usage (на ВМ, после migrate --with-policies): sudo bash scripts/r2-vm-db-run.sh scripts/c2-seed-staging.mjs
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import pg from 'pg'
import { hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { quoteIdent, quoteTable } from '../api/_lib/pgRest/ident.js'
import { buildC2SeedRows, C2_SEED_STAFF, C2_SEED_TABLE_ORDER, c2SeedGuardError } from '../src/lib/c2SeedCore.js'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

const CREDENTIALS_FILE = process.env.C2_SEED_CREDENTIALS_FILE || '/opt/fitness-diary/.c2-seed-credentials'

async function insertRows(client, table, rows) {
  for (const row of rows) {
    const keys = Object.keys(row)
    const cols = keys.map((k) => quoteIdent(k)).join(', ')
    const ph = keys.map((_, i) => `$${i + 1}`).join(', ')
    await client.query(`INSERT INTO ${quoteTable(table)} (${cols}) VALUES (${ph})`, keys.map((k) => row[k]))
  }
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) {
    console.error('Задайте DATABASE_URL (Managed PG стенда).')
    process.exit(1)
  }
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    const counts = {}
    for (const table of C2_SEED_TABLE_ORDER) {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${quoteTable(table)}`)
      counts[table] = r.rows[0].n
    }
    const guard = c2SeedGuardError(counts)
    if (guard) throw new Error(guard)

    const passwords = {}
    const passwordHashes = {}
    for (const s of C2_SEED_STAFF) {
      passwords[s.key] = randomBytes(12).toString('base64url')
      passwordHashes[s.key] = await hashOwnPassword(passwords[s.key])
    }
    const rows = buildC2SeedRows({ today: new Date().toISOString().slice(0, 10), newId: randomUUID, passwordHashes })

    await client.query('BEGIN')
    try {
      for (const table of C2_SEED_TABLE_ORDER) await insertRows(client, table, rows[table])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }

    const lines = C2_SEED_STAFF.map((s) => `${s.login}\t${passwords[s.key]}`)
    await writeFile(CREDENTIALS_FILE, `${lines.join('\n')}\n`, { mode: 0o600 })
    console.log(`seed ok: клуб 1, сотрудников ${rows.users.length}, клиентов ${rows.clients.length}`)
    console.log(`логины: ${C2_SEED_STAFF.map((s) => s.login).join(', ')}; пароли — в ${CREDENTIALS_FILE} (0600)`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
