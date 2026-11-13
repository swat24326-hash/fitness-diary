/**
 * Когда полоска сторис может листать кадр сама (без React).
 * Видео — только по ended/ошибке: иначе iPhone обрывает на 5 с до metadata / до play().
 */
import { storyMimeIsVideo } from './storyClubCore.js'

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
  return n >= 1 ? n : null
}
