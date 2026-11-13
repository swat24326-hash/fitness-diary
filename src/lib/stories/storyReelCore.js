/**
 * Когда полоска сторис может листать кадр сама (без React).
 * Видео — только по ended/ошибке: иначе iPhone обрывает на 5 с до metadata / до play().
 */
import { storyMimeIsVideo } from './storyClubCore.js'

/** После открытия кружка тот же тап на iPhone попадает в «далее» и закрывает сторис. */
export const STORY_OPEN_GUARD_MS = 550

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
 * Тап, открывший кружок, ещё «живой» — зоны листания не принимать.
 * @param {number} now
 * @param {number} guardUntil
 */
export function storyReelOpenBlocked(now, guardUntil) {
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
  return true
}
