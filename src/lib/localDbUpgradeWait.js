/**
 * Обновление базы на устройстве ждёт, пока другая копия приложения (вкладка, окно) отпустит старую версию.
 * Без сигнала все чтения IndexedDB молча висят (INC-2026-10-14-01).
 */

import { recordAppError } from './appErrorJournal.js'

export const LOCAL_DB_UPGRADE_BLOCKED = 'fitness-diary-local-db-blocked'

export const LOCAL_DB_BLOCKED_TEXT =
  'Приложение открыто ещё в одной вкладке или окне — обновление данных на планшете ждёт. Закройте все вкладки и окна приложения (в Chrome тоже) и откройте его снова.'

let blocked = false

export function isLocalDbUpgradeBlocked() {
  return blocked
}

/** @param {boolean} next */
export function setLocalDbUpgradeBlocked(next) {
  const value = next === true
  if (value === blocked) return
  blocked = value
  if (value) recordAppError({ source: 'app', error: LOCAL_DB_BLOCKED_TEXT, context: 'база на устройстве' })
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LOCAL_DB_UPGRADE_BLOCKED, { detail: { blocked: value } }))
}
