/**
 * Нагрузочный клуб на стенде (docs/CAPACITY_PLAN.md, этап B) и токены для scripts/stand-load-test.mjs.
 * Только локальная база стенда (loadSeedGuardError). Тренеры войти паролем не могут — токены выпускаются ключом стенда.
 *
 * Usage (на стенде, из /opt/fitness-diary):
 *   sudo -u osapp node --env-file=.env scripts/stand-load-seed.mjs seed [--trainers 300]
 *   sudo -u osapp node --env-file=.env scripts/stand-load-seed.mjs tokens /tmp/load-tokens.json
 *   sudo -u osapp node --env-file=.env scripts/stand-load-seed.mjs drop
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import pg from 'pg'
import { buildOwnSession, hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { buildClientSession } from '../api/_lib/clientPortal/clientAuthCore.js'
import { quoteIdent, quoteTable } from '../api/_lib/pgRest/ident.js'
import {
  LOAD_CLUB_NAME,
  LOAD_DEFAULTS,
  LOAD_TRAINER_TABLES,
  buildDeskClients,
  buildLoadTrainer,
  loadSeedGuardError,
} from '../src/lib/loadTest/loadSeedCore.js'

const BATCH = 400

async function insertMany(client, table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH)
    const keys = Object.keys(part[0])
    const values = []
    const tuples = part.map((row) => `(${keys.map((k) => `$${values.push(row[k])}`).join(', ')})`)
    await client.query(`INSERT INTO ${quoteTable(table)} (${keys.map(quoteIdent).join(', ')}) VALUES ${tuples.join(', ')}`, values)
  }
}

async function loadClubId(client) {
  const r = await client.query('SELECT id FROM public.clubs WHERE name = $1', [LOAD_CLUB_NAME])
  return r.rows[0]?.id ?? null
}

async function seed(client, trainers) {
  if (await loadClubId(client)) throw new Error('Нагрузочный клуб уже есть — сначала drop')
  const today = new Date().toISOString().slice(0, 10)
  const clubId = randomUUID()
  const typeId = randomUUID()
  await client.query('INSERT INTO public.clubs (id, name, is_active) VALUES ($1, $2, true)', [clubId, LOAD_CLUB_NAME])
  await client.query(
    `INSERT INTO public.membership_types (id, club_id, code, sort_order, trainer_pay_per_session) VALUES ($1, $2, 'ПТ-12', 1, 500)`,
    [typeId, clubId],
  )
  const passwordHash = await hashOwnPassword(randomBytes(24).toString('base64url'))
  const started = Date.now()
  let trainingClientIds = []
  for (let index = 0; index < trainers; index++) {
    const rows = buildLoadTrainer({ index, clubId, typeId, passwordHash, today, newId: randomUUID })
    await client.query('BEGIN')
    for (const table of LOAD_TRAINER_TABLES) {
      await insertMany(client, table, table === 'users' ? [rows.user] : rows[table])
    }
    await client.query('COMMIT')
    trainingClientIds.push(...rows.clients.map((c) => c.id))
    if ((index + 1) % 25 === 0) console.log(`тренеров ${index + 1}/${trainers} (${Math.round((Date.now() - started) / 1000)} с)`)
  }
  const deskCount = Math.max(0, LOAD_DEFAULTS.totalClients - trainingClientIds.length)
  for (let offset = 0; offset < deskCount; offset += 5000) {
    const desk = buildDeskClients({ count: Math.min(5000, deskCount - offset), offset, clubId, newId: randomUUID })
    await insertMany(client, 'clients', desk)
    await insertMany(
      client,
      'memberships',
      desk.map((c) => ({
        id: randomUUID(), client_id: c.id, club_id: clubId, membership_type_id: typeId,
        start_date: today, end_date: today, total_trainings: 1, status: 'active', hall: 'az',
      })),
    )
  }
  trainingClientIds = trainingClientIds.slice(0, LOAD_DEFAULTS.clientSessions)
  await insertMany(client, 'client_sessions', trainingClientIds.map((id) => ({ id: randomUUID(), client_id: id })))
  await client.query('ANALYZE')
  console.log(`seed ok: тренеров ${trainers}, клиентов ${LOAD_DEFAULTS.totalClients}, сессий клиентов ${trainingClientIds.length} (${Math.round((Date.now() - started) / 1000)} с)`)
}

async function tokens(client, outFile) {
  const clubId = await loadClubId(client)
  if (!clubId) throw new Error('Нагрузочного клуба нет — сначала seed')
  const secret = String(process.env.JWT_SECRET ?? '')
  const users = await client.query(`SELECT id, email FROM public.users WHERE club_id = $1 AND role = 'trainer' ORDER BY login`, [clubId])
  const sessions = await client.query(
    'SELECT s.id, s.client_id FROM public.client_sessions s JOIN public.clients c ON c.id = s.client_id WHERE c.club_id = $1 AND s.revoked_at IS NULL',
    [clubId],
  )
  const out = {
    trainers: users.rows.map((u) => buildOwnSession({ id: u.id, email: u.email }, secret).access_token),
    clients: sessions.rows.map((s) => buildClientSession({ clientId: s.client_id, sid: s.id }, secret).access_token),
  }
  await writeFile(outFile, JSON.stringify(out), { mode: 0o600 })
  console.log(`токены: тренеров ${out.trainers.length}, клиентов ${out.clients.length} → ${outFile} (живут 1 час)`)
}

async function drop(client) {
  const clubId = await loadClubId(client)
  if (!clubId) return console.log('нагрузочного клуба нет')
  await client.query('BEGIN')
  await client.query('DELETE FROM public.clients WHERE club_id = $1', [clubId])
  await client.query('DELETE FROM public.users WHERE club_id = $1', [clubId])
  await client.query('DELETE FROM public.clubs WHERE id = $1', [clubId])
  await client.query('COMMIT')
  console.log('нагрузочный клуб удалён')
}

const [mode, arg] = process.argv.slice(2)
const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
const guard = loadSeedGuardError({ databaseUrl, hostname: os.hostname() })
if (guard) {
  console.error(guard)
  process.exit(1)
}
const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  if (mode === 'seed') {
    const i = process.argv.indexOf('--trainers')
    await seed(client, i > 0 ? Number(process.argv[i + 1]) : LOAD_DEFAULTS.trainers)
  } else if (mode === 'tokens') await tokens(client, arg || '/tmp/load-tokens.json')
  else if (mode === 'drop') await drop(client)
  else {
    console.error('Usage: stand-load-seed.mjs seed|tokens <file>|drop')
    process.exitCode = 2
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(e?.message || e)
  process.exitCode = 1
} finally {
  await client.end()
}
