/**
 * Отметки для центра сбоев в localStorage (не IndexedDB: база может быть заблокирована — это и есть сбой).
 * Загрузка данных тренера и «на сервере новая сборка, а у нас старая».
 */
import { nextPullMark } from './deviceHealthSignalsCore.js'

const PULL_KEY = 'fd-device-health-pull'
const BUILD_KEY = 'fd-device-health-build-stale'

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим / квота — центр сбоев не должен ломать загрузку */
  }
}

export function readPullMark() {
  return read(PULL_KEY)
}

/** Итог trainer-pull. Неудачи без сети не считаем — это не сбой планшета. */
export function notePullResult(ok, now = Date.now()) {
  if (!ok && typeof navigator !== 'undefined' && navigator.onLine === false) return
  write(PULL_KEY, nextPullMark(read(PULL_KEY), ok, now))
}

/** С какого момента сервер отдаёт другую сборку, чем запущена (null — сборка свежая). */
export function noteBuildProbe(localId, stale, now = Date.now()) {
  if (!stale || !localId) {
    if (!stale) write(BUILD_KEY, null)
    return null
  }
  const prev = read(BUILD_KEY)
  if (prev?.localId === localId && Number(prev.since) > 0) return Number(prev.since)
  write(BUILD_KEY, { localId, since: now })
  return now
}
