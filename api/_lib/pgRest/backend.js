/** Флаг data-port: API `.from()` идёт в Postgres, а не в PostgREST. По умолчанию выключен. */

export function isPgDataBackend() {
  return String(process.env.DATA_BACKEND ?? '').trim().toLowerCase() === 'pg'
}

/** @returns {string | null} */
export function pgDataBackendEnvError() {
  if (!isPgDataBackend()) return null
  if (!String(process.env.DATABASE_URL ?? '').trim()) {
    return 'DATA_BACKEND=pg: на сервере задайте DATABASE_URL.'
  }
  return null
}

/** Путь к CA из query `sslrootcert` (файл на сервере, не секрет). */
export function pgSslCaPath(databaseUrl) {
  try {
    const path = new URL(String(databaseUrl ?? '')).searchParams.get('sslrootcert')
    const trimmed = String(path ?? '').trim()
    return trimmed || null
  } catch {
    return null
  }
}
