/**
 * Один сотрудник на стенд C2 (свой вход): логин, роль, имя. Клуб — единственный на стенде.
 * Пароль генерируется здесь и дописывается в файл 0600 (C2_SEED_CREDENTIALS_FILE), в stdout — только логин.
 *
 * Usage (на ВМ): sudo bash scripts/r2-vm-db-run.sh scripts/c2-add-staff.mjs <login> <role> [имя]
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFile } from 'node:fs/promises'
import pg from 'pg'
import { hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { buildC2StaffRow } from '../src/lib/c2SeedCore.js'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

const CREDENTIALS_FILE = process.env.C2_SEED_CREDENTIALS_FILE || '/opt/fitness-diary/.c2-seed-credentials'

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) throw new Error('Задайте DATABASE_URL (Managed PG стенда).')
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    const clubs = await client.query('SELECT id FROM public.clubs LIMIT 2')
    if (clubs.rows.length > 1) throw new Error('На стенде больше одного клуба — укажите явно (не поддержано).')
    const password = randomBytes(12).toString('base64url')
    const built = buildC2StaffRow({
      login: process.argv[2],
      role: process.argv[3],
      name: process.argv.slice(4).join(' '),
      clubId: clubs.rows[0]?.id,
      id: randomUUID(),
      passwordHash: await hashOwnPassword(password),
    })
    if (built.error) throw new Error(built.error)
    const { row } = built
    const exists = await client.query('SELECT 1 FROM public.users WHERE lower(login) = $1 OR lower(email) = $2', [
      row.login,
      row.email,
    ])
    if (exists.rows.length) throw new Error(`Логин ${row.login} уже есть на стенде.`)
    const keys = Object.keys(row)
    await client.query(
      `INSERT INTO public.users (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
      keys.map((k) => row[k]),
    )
    await appendFile(CREDENTIALS_FILE, `${row.login}\t${password}\n`, { mode: 0o600 })
    console.log(`staff ok: ${row.login} (${row.role}); пароль — в ${CREDENTIALS_FILE} (0600)`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
