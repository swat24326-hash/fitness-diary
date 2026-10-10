/**
 * Ежедневник: «сейчас» в сетке (линия текущего времени, начальный скролл, кнопка «Сегодня»).
 */
import { CLUB_OPS_TIMEZONE } from '../dateRu.js'
import { SCHEDULE_DAY_FOCUS_HOUR } from './trainerScheduleCore.js'

/** Сколько минут показать над линией «сейчас» при открытии сетки. */
export const SCHEDULE_NOW_SCROLL_LEAD_MIN = 60

/**
 * Минуты от полуночи в зоне клуба (МСК), 0…1439.
 * @param {Date} [now]
 * @param {string} [timeZone]
 */
export function minutesOfDayInTimeZone(now = new Date(), timeZone = CLUB_OPS_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value)
    const m = Number(parts.find((p) => p.type === 'minute')?.value)
    if (Number.isFinite(h) && Number.isFinite(m)) return Math.min(1439, Math.max(0, (h % 24) * 60 + m))
  } catch {
    /* fall through */
  }
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * Линия «сейчас» только в колонке сегодняшнего дня.
 * @param {string} dayIso
 * @param {string} todayIso
 * @param {number} nowMinutes
 * @returns {number | null}
 */
export function resolveScheduleNowLineMinutes(dayIso, todayIso, nowMinutes) {
  const day = String(dayIso ?? '').slice(0, 10)
  if (!day || day !== String(todayIso ?? '').slice(0, 10)) return null
  const m = Math.round(Number(nowMinutes))
  if (!Number.isFinite(m) || m < 0 || m > 1439) return null
  return m
}

/**
 * Куда прокрутить сетку при открытии: сегодня в окне — к «сейчас» минус час, иначе к утру.
 * @param {string[]} dayIsos
 * @param {string} todayIso
 * @param {number} nowMinutes
 */
export function resolveScheduleInitialScrollMinutes(dayIsos, todayIso, nowMinutes) {
  const focus = SCHEDULE_DAY_FOCUS_HOUR * 60
  const today = String(todayIso ?? '').slice(0, 10)
  const showsToday = (dayIsos ?? []).some((d) => String(d ?? '').slice(0, 10) === today)
  const m = Math.round(Number(nowMinutes))
  if (!showsToday || !Number.isFinite(m)) return focus
  return Math.max(0, Math.min(23 * 60, m - SCHEDULE_NOW_SCROLL_LEAD_MIN))
}

/** @param {string[]} dayIsos @param {string} todayIso */
export function scheduleRangeIncludesToday(dayIsos, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  return Boolean(today) && (dayIsos ?? []).some((d) => String(d ?? '').slice(0, 10) === today)
}
