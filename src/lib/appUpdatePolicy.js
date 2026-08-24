import { SALES_DRAFT_PREFIX } from './admin/adminSalesDraftStorage.js'
import { hasOpenTrainingDraft } from './openTrainingDraftGuard.js'
import { hasFreshTrainingDraftDurableInStorage } from './trainingDraftDurableStorage.js'

/** @typedef {'immediate' | 'prompt' | 'defer'} UpdateDecision */

const TRAINING_PATH_RE = /\/(?:trainer|admin|club)\/workouts\//

/** Черновик старше этого не блокирует обновление вне экрана отчёта. */
export const SALES_DRAFT_UPDATE_DEFER_MAX_AGE_MS = 4 * 60 * 60 * 1000

/**
 * @param {string} [pathname]
 */
export function isOnTrainingPage(pathname) {
  return TRAINING_PATH_RE.test(String(pathname ?? ''))
}

/**
 * Экран отчёта/плана продаж (не главная, не ПНК).
 * @param {string} [pathname]
 */
export function isOnSalesReportPage(pathname) {
  const p = String(pathname ?? '').split('?')[0].replace(/\/$/, '') || '/'
  return p === '/admin/sales' || p === '/sales'
}

/**
 * Есть ли свежий несохранённый черновик отчёта (по savedAt).
 * Старые «хвосты» на телефоне не считаем активным редактированием.
 * @param {number} [maxAgeMs]
 */
export function hasFreshSalesDraftInStorage(maxAgeMs = SALES_DRAFT_UPDATE_DEFER_MAX_AGE_MS) {
  if (typeof localStorage === 'undefined') return false
  const maxAge = Math.max(0, Number(maxAgeMs) || 0)
  const now = Date.now()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(SALES_DRAFT_PREFIX)) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw)
        const savedAt = Date.parse(String(parsed?.savedAt ?? ''))
        if (!Number.isFinite(savedAt)) return true
        if (now - savedAt <= maxAge) return true
      } catch {
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

/** @deprecated используйте hasFreshSalesDraftInStorage — любой ключ больше не = «сейчас редактируют» */
export function hasAnySalesDraftInStorage() {
  return hasFreshSalesDraftInStorage()
}

/**
 * Можно ли применить обновление PWA без риска для тренировки / отчёта.
 * @param {{
 *   pathname?: string,
 *   syncQueueCount?: number,
 *   hasSalesDraft?: boolean,
 *   hasTrainingDraft?: boolean,
 *   isLoginScreen?: boolean,
 * }} ctx
 * @returns {UpdateDecision}
 */
export function decideAppUpdate(ctx = {}) {
  const pathname = String(ctx.pathname ?? '')
  if (ctx.isLoginScreen || pathname === '/login') return 'immediate'
  if (isOnTrainingPage(pathname)) return 'defer'
  // Явный флаг из тестов / UI; иначе — открытый экран или свежий durable.
  if (ctx.hasTrainingDraft === true) return 'defer'
  if (
    ctx.hasTrainingDraft !== false &&
    (hasOpenTrainingDraft() || hasFreshTrainingDraftDurableInStorage())
  ) {
    return 'defer'
  }
  // Черновик продаж блокирует reload только на экране отчёта — не на главной админа/телефона.
  if (isOnSalesReportPage(pathname)) {
    const hasDraft = ctx.hasSalesDraft ?? hasFreshSalesDraftInStorage()
    if (hasDraft) return 'defer'
  }
  const queue = Math.max(0, Number(ctx.syncQueueCount) || 0)
  if (queue > 0) return 'prompt'
  return 'immediate'
}

/** @param {UpdateDecision} decision */
export function shouldAutoApplyUpdate(decision) {
  return decision === 'immediate'
}
