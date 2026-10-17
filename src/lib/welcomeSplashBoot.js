/**
 * Мгновенный boot-splash в index.html (до React): тот же знак и зум.
 * React снимает его после зума; геометрия совпадает с AppWelcomeSplash (без дёрганья).
 */

import { WELCOME_BOOT_ZOOM_MS } from './welcomeSplashLayoutCore.js'

export { WELCOME_BOOT_ZOOM_MS }

const BOOT_ID = 'yadro-boot-splash'

/** @returns {{ hadBoot: boolean, startedAt: number }} */
export function peekWelcomeBootSplash() {
  if (typeof document === 'undefined') return { hadBoot: false, startedAt: 0 }
  const el = document.getElementById(BOOT_ID)
  if (!el) return { hadBoot: false, startedAt: 0 }
  const startedAt = Number(el.dataset.startedAt) || Date.now()
  return { hadBoot: true, startedAt }
}

/** Убрать boot сразу (уход со splash без анимации). */
export function discardWelcomeBootSplash() {
  if (typeof document === 'undefined') return
  document.getElementById(BOOT_ID)?.remove()
}

/**
 * Снять boot после доигрывания зума (если он ещё на экране).
 * @param {{ startedAt?: number }} [opts]
 * @returns {() => void} cancel
 */
export function scheduleWelcomeBootSplashRemove(opts = {}) {
  if (typeof document === 'undefined') return () => {}
  const el = document.getElementById(BOOT_ID)
  if (!el) return () => {}
  const startedAt = Number(opts.startedAt) || Number(el.dataset.startedAt) || Date.now()
  const left = Math.max(0, WELCOME_BOOT_ZOOM_MS - (Date.now() - startedAt))
  const t = window.setTimeout(() => {
    el.remove()
  }, left)
  return () => window.clearTimeout(t)
}
