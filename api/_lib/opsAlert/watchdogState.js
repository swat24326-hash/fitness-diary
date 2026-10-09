/**
 * Состояние сторожа прода: когда писать «не работает» / «восстановилось» (docs/RELIABILITY_PLAN.md, 2a).
 * Чистая функция: проверки делает scripts/ops-alerts-vm.mjs, здесь только решение и текст.
 */

export const CHECK_LABELS_RU = {
  app: 'приложение на сервере',
  site: 'сайт снаружи',
  db: 'база данных',
  disk: 'место на диске',
}

/** Две неудачи подряд (cron раз в минуту): рестарт при выкатке не будит людей. */
export const FAIL_STREAK_TO_ALERT = 2
export const REMIND_EVERY_MS = 30 * 60 * 1000
const EVENTS_KEEP_MS = 48 * 60 * 60 * 1000

/** @param {number} ms */
export function minutesRu(ms) {
  const m = Math.max(1, Math.round(ms / 60000))
  return `${m} мин`
}

/**
 * @typedef {{ failStreak: number, firstFailAt: number | null, downSince: number | null, lastNotified: number | null }} CheckState
 * @typedef {{ checks: Record<string, CheckState>, events: { key: string, from: number, to: number }[] }} WatchdogState
 * @param {WatchdogState | null | undefined} prev
 * @param {Record<string, { ok: boolean, detail?: string }>} results
 * @param {number} now
 * @returns {{ state: WatchdogState, messages: string[] }}
 */
export function nextWatchdogState(prev, results, now) {
  const checks = { ...(prev?.checks ?? {}) }
  const events = (prev?.events ?? []).filter((e) => now - e.to < EVENTS_KEEP_MS)
  const messages = []

  for (const [key, result] of Object.entries(results)) {
    const label = CHECK_LABELS_RU[key] ?? key
    const cur = checks[key] ?? { failStreak: 0, firstFailAt: null, downSince: null, lastNotified: null }
    if (result.ok) {
      if (cur.downSince != null) {
        messages.push(`ВОССТАНОВИЛОСЬ: ${label}, простой ${minutesRu(now - cur.downSince)}`)
        events.push({ key, from: cur.downSince, to: now })
      }
      checks[key] = { failStreak: 0, firstFailAt: null, downSince: null, lastNotified: null }
      continue
    }
    const next = { ...cur, failStreak: cur.failStreak + 1, firstFailAt: cur.firstFailAt ?? now }
    const detail = result.detail ? ` (${result.detail})` : ''
    if (next.downSince == null && next.failStreak >= FAIL_STREAK_TO_ALERT) {
      next.downSince = next.firstFailAt
      next.lastNotified = now
      messages.push(`НЕ РАБОТАЕТ: ${label}${detail}`)
    } else if (next.downSince != null && now - (next.lastNotified ?? 0) >= REMIND_EVERY_MS) {
      next.lastNotified = now
      messages.push(`ВСЁ ЕЩЁ НЕ РАБОТАЕТ: ${label}, уже ${minutesRu(now - next.downSince)}${detail}`)
    }
    checks[key] = next
  }
  return { state: { checks, events }, messages }
}
