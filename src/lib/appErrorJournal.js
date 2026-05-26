/** Журнал ошибок всего приложения (localStorage + событие для UI). */

export const APP_ERRORS_CHANGED = 'fitness-diary-app-errors'

const STORAGE_KEY = 'fitness-diary-app-errors-v1'
const LEGACY_SYNC_KEY = 'fitness-diary-sync-errors-v1'
const MAX_ENTRIES = 60
const DEDUPE_MS = 5000

/** @type {Record<string, string>} */
export const APP_ERROR_SOURCE_LABELS = {
  sync: 'Синхронизация',
  network: 'Сеть',
  auth: 'Вход',
  pull: 'Загрузка',
  api: 'Сервер',
  app: 'Приложение',
}

let globalHandlersInstalled = false

function safeNowIso() {
  try {
    return new Date().toISOString()
  } catch {
    return ''
  }
}

function notifyChanged() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(APP_ERRORS_CHANGED, { detail: { count: getAppErrorCount() } }))
  } catch {
    /* ignore */
  }
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* ignore */
  }
}

function migrateLegacySyncErrors() {
  try {
    const raw = localStorage.getItem(LEGACY_SYNC_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) {
      localStorage.removeItem(LEGACY_SYNC_KEY)
      return
    }
    const existing = readRaw()
    const migrated = parsed.map((row) => ({
      at: row.at || safeNowIso(),
      source: 'sync',
      error: String(row.error ?? ''),
      status: typeof row.status === 'number' ? row.status : undefined,
      context: [row.table_name, row.operation].filter(Boolean).join(' · ') || undefined,
    }))
    writeRaw([...migrated, ...existing])
    localStorage.removeItem(LEGACY_SYNC_KEY)
  } catch {
    /* ignore */
  }
}

function normalizeEntry(entry) {
  const e = entry && typeof entry === 'object' ? entry : { error: String(entry ?? '') }
  const source = String(e.source ?? 'app').trim() || 'app'
  return {
    at: safeNowIso(),
    source: APP_ERROR_SOURCE_LABELS[source] ? source : 'app',
    error: String(e.error ?? e.message ?? '').trim() || 'Неизвестная ошибка',
    status: typeof e.status === 'number' ? e.status : undefined,
    context: e.context ? String(e.context) : undefined,
    detail: e.detail ? String(e.detail).slice(0, 400) : undefined,
  }
}

function isDuplicate(prev, next) {
  if (!prev || !next) return false
  if (prev.source !== next.source || prev.error !== next.error) return false
  const t0 = Date.parse(prev.at)
  const t1 = Date.parse(next.at)
  if (Number.isNaN(t0) || Number.isNaN(t1)) return false
  return Math.abs(t1 - t0) < DEDUPE_MS
}

/**
 * @param {{ source?: string, error?: string, message?: string, status?: number, context?: string, detail?: string }} entry
 */
export function recordAppError(entry) {
  if (typeof window === 'undefined') return
  migrateLegacySyncErrors()
  const item = normalizeEntry(entry)
  const list = readRaw()
  if (isDuplicate(list[0], item)) return
  writeRaw([item, ...list])
  notifyChanged()
}

/** @param {number} [limit] */
export function getAppErrors(limit = MAX_ENTRIES) {
  migrateLegacySyncErrors()
  const n = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || MAX_ENTRIES))
  return readRaw().slice(0, n)
}

export function getAppErrorCount() {
  return getAppErrors(MAX_ENTRIES).length
}

export function clearAppErrors() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_SYNC_KEY)
  } catch {
    /* ignore */
  }
  notifyChanged()
}

/** @param {(count: number) => void} fn */
export function subscribeAppErrors(fn) {
  if (typeof window === 'undefined') return () => {}
  migrateLegacySyncErrors()
  const handler = () => fn(getAppErrorCount())
  window.addEventListener(APP_ERRORS_CHANGED, handler)
  fn(getAppErrorCount())
  return () => window.removeEventListener(APP_ERRORS_CHANGED, handler)
}

export function sourceLabel(source) {
  return APP_ERROR_SOURCE_LABELS[source] ?? source ?? 'Приложение'
}

export function formatAppErrorTime(at) {
  if (!at) return '—'
  return String(at).replace('T', ' ').slice(0, 19)
}

/** Глобальные необработанные ошибки + миграция старого журнала sync. */
export function initAppErrorJournal() {
  if (typeof window === 'undefined' || globalHandlersInstalled) return
  globalHandlersInstalled = true
  migrateLegacySyncErrors()

  window.addEventListener('error', (ev) => {
    const msg = String(ev.message ?? ev.error?.message ?? 'Ошибка приложения')
    if (/ResizeObserver loop/i.test(msg)) return
    recordAppError({
      source: 'app',
      error: msg,
      detail: ev.filename ? `${ev.filename}:${ev.lineno ?? 0}` : undefined,
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : reason?.message
            ? String(reason.message)
            : 'Необработанное отклонение Promise'
    recordAppError({ source: 'app', error: String(msg) })
  })
}

/** @deprecated используйте recordAppError({ source: 'sync', ... }) */
export function recordSyncError(entry) {
  const e = entry && typeof entry === 'object' ? entry : { error: String(entry ?? '') }
  const ctx = [e.table_name, e.operation].filter(Boolean).join(' · ')
  recordAppError({
    source: 'sync',
    error: e.error,
    status: e.status,
    context: ctx || undefined,
  })
}

export function getRecentSyncErrors(limit = 12) {
  return getAppErrors(limit).filter((x) => x.source === 'sync')
}

export function clearSyncErrors() {
  clearAppErrors()
}
