import { openDB } from 'idb'
import {
  SCREEN_CACHE_APPS,
  isScreenCacheFresh,
  sanitizeScreenCachePayload,
  screenCacheAppOf,
  screenCacheEvictKeys,
  screenCacheSignature,
} from './screenCacheCore.js'

/**
 * Хранилище кэша экранов: своя база IndexedDB (не `fitness-diary` планшета — очередь Sync не задеваем)
 * + копия в памяти, чтобы вернуться на экран в той же вкладке без мигания крутилки.
 * Любая ошибка (приватный Safari, квота) — тихо: экран просто грузится с сервера, как раньше.
 */
const DB_NAME = 'fd-screen-cache'
const STORE = 'entries'

/** @type {Map<string, { key: string, app: string, savedAt: number, data: unknown }>} */
const memory = new Map()
/** @type {Record<string, () => boolean>} */
const guards = {}
/** @type {Promise<import('idb').IDBPDatabase> | null} */
let dbPromise = null

function db() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no idb'))
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'key' }).createIndex('app', 'app')
    },
  }).catch((e) => {
    dbPromise = null
    throw e
  })
  return dbPromise
}

function sessionAllows(app) {
  return !guards[app] || guards[app]()
}

/**
 * Писать только при живой сессии: ответ, пришедший уже после выхода, не должен вернуть данные на телефон.
 * @param {string} app @param {() => boolean} hasSession
 */
export function registerScreenCacheGuard(app, hasSession) {
  guards[app] = hasSession
}

/** Мгновенно, без IndexedDB: то, что уже показывали в этой вкладке. Без сессии — null. @param {string} key */
export function peekScreenCache(key) {
  if (!key || !sessionAllows(screenCacheAppOf(key))) return null
  const hit = memory.get(key)
  return hit && isScreenCacheFresh(hit, Date.now()) ? hit.data : null
}

/** @param {string} key @returns {Promise<unknown | null>} */
export async function readScreenCache(key) {
  if (!key || !sessionAllows(screenCacheAppOf(key))) return null
  const hot = peekScreenCache(key)
  if (hot != null) return hot
  try {
    const row = await (await db()).get(STORE, key)
    if (!row || !isScreenCacheFresh(row, Date.now())) return null
    if (!sessionAllows(row.app)) return null
    memory.set(key, row)
    return row.data
  } catch {
    return null
  }
}

/** @param {string} key @param {unknown} data */
export async function writeScreenCache(key, data) {
  const app = screenCacheAppOf(key)
  const safe = sanitizeScreenCachePayload(key, data)
  if (!key || safe == null || !sessionAllows(app)) return
  const prev = memory.get(key)
  if (prev && isScreenCacheFresh(prev, Date.now()) && screenCacheSignature(prev.data) === screenCacheSignature(safe)) return
  const row = { key, app, savedAt: Date.now(), data: safe }
  memory.set(key, row)
  try {
    const d = await db()
    await d.put(STORE, row)
    const all = await d.getAllFromIndex(STORE, 'app', app)
    const drop = screenCacheEvictKeys(all, Date.now())
    for (const k of drop) {
      memory.delete(k)
      await d.delete(STORE, k)
    }
  } catch {
    /* без кэша — экран просто грузится с сервера */
  }
}

/** Выход из приложения: стереть всё этого приложения. @param {'client' | 'coach'} app */
export async function clearScreenCacheApp(app) {
  for (const k of [...memory.keys()]) if (screenCacheAppOf(k) === app) memory.delete(k)
  try {
    const d = await db()
    const keys = await d.getAllKeysFromIndex(STORE, 'app', app)
    await Promise.all(keys.map((k) => d.delete(STORE, k)))
  } catch {
    /* базы нет — стирать нечего */
  }
}

/** При старте приложения: удалить просроченное (не заходили больше 7 дней). */
export async function purgeScreenCache() {
  try {
    const d = await db()
    const now = Date.now()
    for (const app of SCREEN_CACHE_APPS) {
      const drop = screenCacheEvictKeys(await d.getAllFromIndex(STORE, 'app', app), now)
      await Promise.all(drop.map((k) => d.delete(STORE, k)))
    }
  } catch {
    /* без кэша */
  }
}

/**
 * Старт оболочки /me или /coach: без сессии — стереть кэш приложения (потерянный телефон / старый вход);
 * с сессией — только просроченное.
 * @param {'client' | 'coach'} app
 * @param {() => boolean} hasSession
 */
export async function bootScreenCache(app, hasSession) {
  if (!hasSession()) await clearScreenCacheApp(app)
  else await purgeScreenCache()
}
