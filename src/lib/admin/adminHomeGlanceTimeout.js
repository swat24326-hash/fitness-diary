/**
 * Таймауты glance на главной админа /club:
 * облако (Supabase) не должно вешать «Продажи», сводку дня и сводку смены.
 */
import { withFastTimeout } from '../supabaseRetry.js'

/** Единый потолок для home-glance сетевых вызовов. */
export const HOME_GLANCE_CLOUD_MS = 8000

/** Продажи на главной тянут больше данных — чуть шире. */
export const HOME_SALES_GLANCE_MS = 12000

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @returns {Promise<T>}
 */
export function withHomeGlanceTimeout(promise, ms = HOME_GLANCE_CLOUD_MS) {
  return withFastTimeout(promise, ms)
}

/**
 * Сообщение для UI при обрыве / таймауте облака.
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function homeGlanceCloudFailMessage(err, fallback = 'Облако недоступно — цифры за день не обновились') {
  const raw = String(err?.message ?? err ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (raw === 'timeout' || raw.includes('timeout')) {
    return 'Облако не отвечает — проверьте сеть и обновите страницу'
  }
  if (
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('connection') ||
    raw.includes('err_connection')
  ) {
    return 'Нет связи с облаком — проверьте сеть и обновите страницу'
  }
  if (raw === 'offline') return 'Нет сети — сводку загрузить нельзя'
  if (raw.length <= 120 && !raw.includes('error')) return String(err?.message ?? err).slice(0, 120)
  return fallback
}
