/**
 * Защита от цикла PWA-reload на слабых планшетах:
 * login → auto update → reload → login → auto update…
 * sessionStorage переживает reload в той же вкладке/PWA.
 */

export const PWA_UPDATE_RELOAD_GUARD_KEY = 'fit_pwa_update_reload_v1'

/** Повторный auto-reload в этом окне запрещён — только ручной тап / hard recover. */
export const PWA_UPDATE_RELOAD_COOLDOWN_MS = 90_000

/**
 * @param {unknown} raw
 * @returns {{ at: number, attempts: number } | null}
 */
export function parsePwaUpdateReloadGuard(raw) {
  if (raw == null || raw === '') return null
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    const at = Number(o?.at) || 0
    const attempts = Math.max(0, Number(o?.attempts) || 0)
    if (!at) return null
    return { at, attempts }
  } catch {
    return null
  }
}

/**
 * @param {{ at: number, attempts: number } | null} guard
 * @param {number} [now]
 * @param {number} [cooldownMs]
 */
export function isPwaUpdateReloadInCooldown(guard, now = Date.now(), cooldownMs = PWA_UPDATE_RELOAD_COOLDOWN_MS) {
  if (!guard?.at) return false
  return now - guard.at < cooldownMs
}

/**
 * Auto-reload после недавней попытки → петля на слабом планшете.
 * @param {{ at: number, attempts: number } | null} guard
 * @param {number} [now]
 */
export function shouldBlockAutoPwaReload(guard, now = Date.now()) {
  return isPwaUpdateReloadInCooldown(guard, now)
}

/**
 * Повторная попытка в cooldown → нужен hard recover (сброс SW/кэша).
 * @param {{ at: number, attempts: number } | null} guard
 * @param {number} [now]
 */
export function shouldHardRecoverPwaUpdate(guard, now = Date.now()) {
  if (!isPwaUpdateReloadInCooldown(guard, now)) return false
  return (guard?.attempts ?? 0) >= 1
}

/**
 * @param {{ at: number, attempts: number } | null} prev
 * @param {number} [now]
 * @returns {{ at: number, attempts: number }}
 */
export function nextPwaUpdateReloadGuard(prev, now = Date.now()) {
  if (isPwaUpdateReloadInCooldown(prev, now)) {
    return { at: now, attempts: (prev?.attempts ?? 0) + 1 }
  }
  return { at: now, attempts: 1 }
}

/**
 * Auto только если политика immediate и auth уже не в splash, и нет cooldown.
 * @param {{
 *   decision?: string,
 *   authLoading?: boolean,
 *   guard?: { at: number, attempts: number } | null,
 *   now?: number,
 * }} ctx
 */
export function shouldAutoApplyPwaUpdate(ctx = {}) {
  if (ctx.authLoading === true) return false
  if (shouldBlockAutoPwaReload(ctx.guard ?? null, ctx.now)) return false
  return ctx.decision === 'immediate'
}
