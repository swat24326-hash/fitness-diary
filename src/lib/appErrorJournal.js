/** Журнал ошибок всего приложения (localStorage + событие для UI). */

export const APP_ERRORS_CHANGED = 'fitness-diary-app-errors'
export const SYNC_ATTENTION_CHANGED = 'fitness-diary-sync-attention'

const RECOVERABLE_TEXT =
  /нет сети|нет связи|показаны данные с устройства|синхронизац\w* отложен|failed to fetch|fetch failed|network|offline|недоступн|timeout|timed out|aborted|в очереди осталось/i

let syncNeedsAttention = false

const STORAGE_KEY = 'fitness-diary-app-errors-v1'
const LEGACY_SYNC_KEY = 'fitness-diary-sync-errors-v1'
const MAX_ENTRIES = 60
const DEDUPE_MS = 5000
const DEDUPE_PULL_MS = 120_000

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

function notifySyncAttention() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(SYNC_ATTENTION_CHANGED, { detail: { needsAttention: syncNeedsAttention } }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Транзиентные сбои (сеть, офлайн) — снимаются после успешного Sync с пустой очередью.
 * @param {{ source?: string, error?: string, context?: string, status?: number }} row
 */
export function isRecoverableTransientError(row) {
  if (!row) return false
  const source = String(row.source ?? '')
  const text = `${row.error ?? ''} ${row.context ?? ''}`
  const status = row.status

  if (source === 'network') return true
  if (status === 0) return true
  if (status === 409) return true

  if (source === 'sync' || source === 'pull') {
    if (RECOVERABLE_TEXT.test(text)) return true
    // Отклонённые push (403): очередь уже снята — не держать «требует внимания».
    if (source === 'sync' && status === 403) {
      return /нет доступа|не найден|закрепл|администратор|другого клуба|должен быть|нельзя переназначить/i.test(
        text,
      )
    }
  }

  return false
}

/** Ошибки в журнале, которые не считаются «уже решёнными» после успешного Sync. */
export function getPersistentErrorCount() {
  migrateLegacySyncErrors()
  return readRaw().filter((r) => !isRecoverableTransientError(r)).length
}

export function getSyncNeedsAttention() {
  return syncNeedsAttention
}

/**
 * Нужно ли показывать предупреждение (точка на меню): очередь, последний сбой Sync или серьёзные ошибки в журнале.
 * @param {number} [queueCount]
 */
export function computeNeedsUserAttention(queueCount = 0) {
  if (queueCount > 0) return true
  if (syncNeedsAttention) return true
  if (getPersistentErrorCount() > 0) return true
  return false
}

/** @param {(needsAttention: boolean) => void} fn */
export function subscribeSyncAttention(fn) {
  if (typeof window === 'undefined') return () => {}
  migrateLegacySyncErrors()
  const handler = () => fn(computeNeedsUserAttention(0))
  window.addEventListener(SYNC_ATTENTION_CHANGED, handler)
  window.addEventListener(APP_ERRORS_CHANGED, handler)
  fn(computeNeedsUserAttention(0))
  return () => {
    window.removeEventListener(SYNC_ATTENTION_CHANGED, handler)
    window.removeEventListener(APP_ERRORS_CHANGED, handler)
  }
}

/** Убрать из localStorage уже неактуальные (сеть, 403 после снятия с очереди). */
export function pruneRecoverableAppErrors() {
  migrateLegacySyncErrors()
  const list = readRaw()
  const kept = list.filter((r) => !isRecoverableTransientError(r))
  const listChanged = kept.length !== list.length
  if (listChanged) writeRaw(kept)
  const nextAttention = getPersistentErrorCount() > 0
  const attentionChanged = syncNeedsAttention !== nextAttention
  syncNeedsAttention = nextAttention
  if (listChanged) notifyChanged()
  if (listChanged || attentionChanged) notifySyncAttention()
}

/** После старта: флаг «нужно внимание» только если в журнале остались серьёзные записи. */
export function initSyncAttentionFromJournal() {
  pruneRecoverableAppErrors()
}

/**
 * Итог попытки синхронизации: при успехе (очередь 0, без замечаний) убираем транзиентные записи журнала.
 * @param {{ queueCount: number, hadError?: boolean }} outcome
 */
export function reportSyncOutcome({ queueCount, hadError: _hadError = false }) {
  const queue = Math.max(0, Number(queueCount) || 0)

  if (queue === 0) {
    const list = readRaw()
    const kept = list.filter((r) => !isRecoverableTransientError(r))
    if (kept.length !== list.length) writeRaw(kept)
    syncNeedsAttention = getPersistentErrorCount() > 0
  } else {
    syncNeedsAttention = true
  }

  notifyChanged()
  notifySyncAttention()
}

/** Удалить из журнала записи о сети/временных сбоях sync (ручная очистка или успешный Sync). */
export function clearRecoverableAppErrors() {
  migrateLegacySyncErrors()
  const kept = readRaw().filter((r) => !isRecoverableTransientError(r))
  writeRaw(kept)
  notifyChanged()
  notifySyncAttention()
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
  const windowMs = next.source === 'pull' ? DEDUPE_PULL_MS : DEDUPE_MS
  return Math.abs(t1 - t0) < windowMs
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
  syncNeedsAttention = false
  notifyChanged()
  notifySyncAttention()
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
