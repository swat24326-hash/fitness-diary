import { SALES_DRAFT_PREFIX } from './admin/adminSalesDraftStorage.js'

/** @typedef {'immediate' | 'prompt' | 'defer'} UpdateDecision */

const TRAINING_PATH_RE = /\/(?:trainer|admin)\/workouts\//

/**
 * @param {string} [pathname]
 */
export function isOnTrainingPage(pathname) {
  return TRAINING_PATH_RE.test(String(pathname ?? ''))
}

/**
 * Есть ли несохранённый черновик отчёта продаж в localStorage.
 */
export function hasAnySalesDraftInStorage() {
  if (typeof localStorage === 'undefined') return false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(SALES_DRAFT_PREFIX)) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Можно ли применить обновление PWA без риска для тренировки / отчёта.
 * @param {{
 *   pathname?: string,
 *   syncQueueCount?: number,
 *   hasSalesDraft?: boolean,
 *   isLoginScreen?: boolean,
 * }} ctx
 * @returns {UpdateDecision}
 */
export function decideAppUpdate(ctx = {}) {
  const pathname = String(ctx.pathname ?? '')
  if (ctx.isLoginScreen || pathname === '/login') return 'immediate'
  if (isOnTrainingPage(pathname)) return 'defer'
  if (ctx.hasSalesDraft ?? hasAnySalesDraftInStorage()) return 'defer'
  const queue = Math.max(0, Number(ctx.syncQueueCount) || 0)
  if (queue > 0) return 'prompt'
  return 'immediate'
}

/** @param {UpdateDecision} decision */
export function shouldAutoApplyUpdate(decision) {
  return decision === 'immediate'
}
