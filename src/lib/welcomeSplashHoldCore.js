/**
 * Минимальное время показа стартового splash (как у нативных приложений).
 * Без React: auth может закончиться за 200 мс — анимацию не обрываем.
 */

/** Полный цикл: зум + приветствие (~2.2 с). */
export const WELCOME_SPLASH_MIN_MS = 2200

/** При reduced-motion — короче, без ожидания анимации. */
export const WELCOME_SPLASH_MIN_REDUCED_MS = 400

/**
 * Сколько ещё держать splash после окончания busy.
 * @param {number} startedAt — Date.now() в момент первого показа
 * @param {number} [now]
 * @param {number} [minMs]
 * @returns {number} мс ≥ 0
 */
export function welcomeSplashRemainMs(startedAt, now = Date.now(), minMs = WELCOME_SPLASH_MIN_MS) {
  const start = Number(startedAt)
  if (!Number.isFinite(start) || start <= 0) return 0
  const min = Math.max(0, Number(minMs) || 0)
  return Math.max(0, min - (Number(now) - start))
}

/**
 * @param {number} startedAt
 * @param {number} [now]
 * @param {number} [minMs]
 * @returns {boolean}
 */
export function shouldHoldWelcomeSplash(startedAt, now = Date.now(), minMs = WELCOME_SPLASH_MIN_MS) {
  return welcomeSplashRemainMs(startedAt, now, minMs) > 0
}
