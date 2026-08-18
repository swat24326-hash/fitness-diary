/**
 * Короткие таймауты лояльности: complete / push архива не ждут club-stats 45 с.
 */

/** Карточка / glance / списание. Не CLUB_STATS 45 с. */
export const LOYALTY_FETCH_TIMEOUT_MS = 8_000
/** First complete: лучше дефолт 60/800, чем стоп формы. */
export const LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS = 4_000
/** Архив / переезд: last-good сразу; сеть только если кэша нет. */
export const LOYALTY_WARN_TIMEOUT_MS = 2_000
/** Снимок баллов перед burn_archive в том же push clients. */
export const LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS = 3_000

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export async function raceWithTimeout(promise, ms, label = 'timeout') {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
