/**
 * Когда полоска сторис может листать кадр сама (без React).
 * Видео — только по ended/ошибке: иначе iPhone обрывает на 5 с до metadata / до play().
 */
import { storyMimeIsVideo } from './storyClubCore.js'

/** После открытия кружка тот же тап на iPhone попадает в «далее» и закрывает сторис. */
export const STORY_OPEN_GUARD_MS = 1000

/**
 * @param {string | null | undefined} mime
 * @returns {boolean}
 */
export function storyReelAdvanceOnFill(mime) {
  return !storyMimeIsVideo(mime)
}

/**
 * Длительность полоски: фото — фикс; видео — только после известной длины.
 * @param {{ mime?: string | null, sec?: number | null, photoSec: number }} p
 * @returns {number | null} null — полоску ещё не запускать
 */
export function storyReelFillSec({ mime, sec, photoSec }) {
  if (!storyMimeIsVideo(mime)) return Math.max(1, Number(photoSec) || 5)
  const n = Math.round(Number(sec) || 0)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(60, n)
}

/**
 * Пауза воспроизведения: только удержание / оверлей.
 * Нельзя ставить на паузу из‑за «полоска ещё без sec» — на iPhone играет 1 с и зависает.
 * @param {{ userPaused?: boolean, held?: boolean }} p
 */
export function storyReelPlaybackPaused({ userPaused, held }) {
  return Boolean(userPaused) || Boolean(held)
}

/**
 * Тап, открывший кружок, ещё «живой» — зоны листания не принимать.
 * Пока кадр не показан — тоже: иначе «далее» закрывает пустой просмотр.
 * @param {{ now: number, guardUntil: number, hasShown?: boolean }} p
 */
export function storyReelOpenBlocked({ now, guardUntil, hasShown = true }) {
  if (!hasShown) return true
  return Number(now) < Number(guardUntil)
}

/**
 * Ложный ended на iPhone (ещё не играло / сразу в нуле) — не закрывать.
 * @param {{ currentTime?: number, duration?: number, hasStarted?: boolean }} p
 */
export function storyReelAcceptVideoEnded({ currentTime, duration, hasStarted }) {
  if (!hasStarted) return false
  const t = Number(currentTime) || 0
  const d = Number(duration) || 0
  if (Number.isFinite(d) && d >= 1.5 && t < 0.6) return false
  if (Number.isFinite(d) && d >= 1.5 && t < d * 0.5) return false
  return true
}
