/**
 * Секундомер в шапке тренера — чистая логика без React.
 * Цифры на экране меняются раз в десятую секунды; не гонять React 60 раз/с.
 */

/** Интервал отрисовки, мс (совпадает с точностью «.tenths»). */
export const STOPWATCH_PAINT_MS = 100

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatStopwatch(ms) {
  const t = Math.max(0, Math.floor(Number(ms) || 0))
  const tenths = Math.floor((t % 1000) / 100)
  const sec = Math.floor(t / 1000) % 60
  const min = Math.floor(t / 60000) % 60
  const hour = Math.floor(t / 3600000)
  if (hour > 0) {
    return `${hour}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`
}

/**
 * Текущее показание: пауза → накопленное; ход → накопленное + (сейчас − старт).
 * @param {{ baseMs: number, startedAt: number|null, now: number }} p
 * @returns {number}
 */
export function stopwatchElapsedMs({ baseMs, startedAt, now }) {
  const base = Math.max(0, Number(baseMs) || 0)
  if (startedAt == null) return base
  const start = Number(startedAt)
  const t = Number(now)
  if (!Number.isFinite(start) || !Number.isFinite(t)) return base
  return base + Math.max(0, t - start)
}
