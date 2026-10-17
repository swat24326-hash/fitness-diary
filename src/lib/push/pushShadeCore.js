/**
 * Шторка системных push (Web Notifications) — одно правило на всю сеть.
 * Приложение клиента / тренера / зала на одном origin: гасим только «своё» приложение.
 */
import { pushAppOfPath } from './pushOpenCore.js'

/**
 * Какому приложению принадлежит плашка (по data.url из push).
 * @param {unknown} dataUrl
 * @returns {'client'|'coach'|'staff'}
 */
export function pushShadeNotificationApp(dataUrl) {
  const raw = String(dataUrl ?? '/')
  try {
    const path = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://app.local').pathname
    return pushAppOfPath(path)
  } catch {
    return 'staff'
  }
}

/**
 * Показывать ли плашку в шторке: если это же приложение уже на экране — нет
 * (числа/лента обновятся через push-received).
 * @param {{ notificationApp: string, focusedApps?: Iterable<string> }} opts
 */
export function pushShouldShowShade({ notificationApp, focusedApps = [] }) {
  const app = String(notificationApp || '')
  for (const a of focusedApps) {
    if (String(a) === app) return false
  }
  return true
}

/** Гасить плашку при входе в это приложение (иконка / возврат с фона). */
export function pushShadeBelongsToApp(notificationApp, currentApp) {
  return String(notificationApp || '') === String(currentApp || '')
}
