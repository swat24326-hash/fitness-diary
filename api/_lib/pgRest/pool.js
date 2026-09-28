import fs from 'node:fs'
import pg from 'pg'
import { pgClientSslOption } from '../../../src/lib/pgMigrateOrderCore.js'
import { pgSslCaPath } from './backend.js'
import { pgNumberMaybe, pgTimestamptzToIso } from './pgValues.js'

const { types } = pg

let parsersReady = false
let typesReady = false
/** @type {Map<string, string>} */
let typesByKey = new Map()
/** @type {import('pg').Pool | null} */
let pool = null

function applyTypeParsers() {
  if (parsersReady) return
  parsersReady = true
  types.setTypeParser(1082, (value) => value)
  types.setTypeParser(1114, (value) => value)
  types.setTypeParser(1184, (value) => pgTimestamptzToIso(value))
  types.setTypeParser(1700, (value) => pgNumberMaybe(value))
  types.setTypeParser(20, (value) => pgNumberMaybe(value))
}

function sslConfig(databaseUrl) {
  const ssl = pgClientSslOption(databaseUrl)
  if (ssl === undefined) return undefined
  const caPath = pgSslCaPath(databaseUrl)
  if (!caPath) return ssl
  let ca
  try {
    ca = fs.readFileSync(caPath)
  } catch {
    const err = new Error(`DATA_BACKEND=pg: не прочитан сертификат ${caPath}`)
    err.code = 'PGREST_SSL'
    throw err
  }
  return { ...ssl, ca }
}

export function getPgRestPool() {
  if (pool) return pool
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) {
    const err = new Error('DATA_BACKEND=pg: на сервере задайте DATABASE_URL.')
    err.code = 'PGREST_ENV'
    throw err
  }
  applyTypeParsers()
  const ssl = sslConfig(databaseUrl)
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 8,
    connectionTimeoutMillis: 8000,
    query_timeout: 20000,
    statement_timeout: 20000,
    ...(ssl !== undefined ? { ssl } : {}),
  })
  pool.on('error', (err) => {
    console.warn('[pgrest]', err?.code || 'pool')
  })
  return pool
}

async function ensureColumnTypes() {
  if (typesReady) return
  const result = await getPgRestPool().query(
    `SELECT table_name, column_name, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public'`,
  )
  const next = new Map()
  for (const row of result.rows) {
    next.set(`${row.table_name}.${row.column_name}`, row.udt_name)
  }
  typesByKey = next
  typesReady = true
}

/** @param {string} table */
export async function loadUdtOf(table) {
  await ensureColumnTypes()
  return (column) => typesByKey.get(`${table}.${column}`) ?? null
}

/**
 * @param {{ text: string | null, countText: string | null, values: unknown[] }} compiled
 */
export async function executeCompiled(compiled) {
  const db = getPgRestPool()
  if (compiled.countText && !compiled.text) {
    const count = await db.query(compiled.countText, compiled.values)
    return { rows: [], count: Number(count.rows[0]?._fd_count ?? 0) }
  }
  if (compiled.countText && compiled.text) {
    // Два запроса с одним WHERE: пустая страница всё равно получает полный count.
    const [count, data] = await Promise.all([
      db.query(compiled.countText, compiled.values),
      db.query(compiled.text, compiled.values),
    ])
    return { rows: data.rows, count: Number(count.rows[0]?._fd_count ?? 0) }
  }
  const data = await db.query(compiled.text, compiled.values)
  return { rows: data.rows, count: null }
}
