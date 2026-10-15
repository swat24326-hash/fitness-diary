/**
 * Смайлик рядом с именем, как эмодзи-статус в Telegram: каждый ставит себе сам («Мой профиль») на срок —
 * час, до конца дня, 3 дня, неделю или пока не уберёт. У клиента в день рождения — 🎂 (дата из карточки клуба).
 * Смайлик только из нашего набора: одинаково выглядит у всех и в базу не попадает произвольный текст.
 * Без React, браузера и базы — общее для сервера и экрана, проверяется verify-profile-status.mjs.
 */
import { isBirthdayToday } from '../clientBirthdays.js'
import { CLUB_OPS_TIMEZONE, todayInTimeZoneIso } from '../dateRu.js'

export const PROFILE_STATUS_EMOJIS = Object.freeze([
  '💪', '🔥', '🏋️', '🏃', '🧘', '🚴', '🏊', '🥊',
  '🏆', '🥇', '🎯', '⚡', '😎', '😊', '🥳', '❤️',
  '👍', '🙏', '☕', '🍏', '🏖️', '✈️', '🤒', '😴',
])
export const PROFILE_BIRTHDAY_EMOJI = '🎂'

export const PROFILE_STATUS_DURATIONS = Object.freeze([
  { id: '1h', label: '1 час' },
  { id: 'today', label: 'Сегодня' },
  { id: '3d', label: '3 дня' },
  { id: 'week', label: 'Неделя' },
  { id: 'forever', label: 'Пока не уберу' },
])

export const PROFILE_STATUS_BAD_RU = 'Такой статус поставить нельзя — выберите смайлик из списка'

const EMOJIS = new Set(PROFILE_STATUS_EMOJIS)
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Сдвиг зоны от UTC в мс на момент now (Москва без перехода на летнее время, но зону берём честно). */
function zoneOffsetMs(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  )
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(now.getTime() / 1000) * 1000
}

/** Полночь следующего дня по часам клуба (UTC ISO). */
function endOfClubDay(now, timeZone) {
  const [y, m, d] = todayInTimeZoneIso(timeZone, now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1) - zoneOffsetMs(now, timeZone)).toISOString()
}

/**
 * До какого момента держать статус. null — без срока; undefined — срок не из списка.
 * @param {string} duration id из PROFILE_STATUS_DURATIONS
 */
export function profileStatusUntil(duration, now = new Date(), timeZone = CLUB_OPS_TIMEZONE) {
  const t = now.getTime()
  if (duration === '1h') return new Date(t + HOUR).toISOString()
  if (duration === 'today') return endOfClubDay(now, timeZone)
  if (duration === '3d') return new Date(t + 3 * DAY).toISOString()
  if (duration === 'week') return new Date(t + 7 * DAY).toISOString()
  if (duration === 'forever') return null
  return undefined
}

/**
 * Статус из POST: { emoji, duration } — поставить; emoji пустой — убрать.
 * @returns {{ ok: true, emoji: string|null, until: string|null } | { ok: false, error: string }}
 */
export function checkProfileStatusInput(input, now = new Date()) {
  const emoji = input?.emoji == null ? '' : String(input.emoji)
  if (!emoji) return { ok: true, emoji: null, until: null }
  if (!EMOJIS.has(emoji)) return { ok: false, error: PROFILE_STATUS_BAD_RU }
  const until = profileStatusUntil(String(input?.duration ?? ''), now)
  if (until === undefined) return { ok: false, error: PROFILE_STATUS_BAD_RU }
  return { ok: true, emoji, until }
}

/** Свой статус, пока не истёк: { emoji, until } или null. */
export function activeOwnStatus(row, now = new Date()) {
  const emoji = String(row?.status_emoji ?? '')
  if (!EMOJIS.has(emoji)) return null
  const until = row?.status_until ? String(row.status_until) : null
  if (until && !(Date.parse(until) > now.getTime())) return null
  return { emoji, until }
}

/** Подпись срока в «Мой профиль»: «до 18:00» сегодня, «до 18.10, 18:00» позже, «без срока». */
export function profileStatusUntilRu(until, now = new Date(), timeZone = CLUB_OPS_TIMEZONE) {
  if (!until) return 'без срока'
  const at = new Date(until)
  if (Number.isNaN(at.getTime())) return 'без срока'
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(at)
  if (todayInTimeZoneIso(timeZone, at) === todayInTimeZoneIso(timeZone, now)) return `до ${time}`
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit' }).format(at)
  return `до ${day}, ${time}`
}

/**
 * Что показать рядом с именем в переписке: у клиента в день рождения — 🎂, иначе свой статус, пока не истёк.
 * @param {{ status_emoji?: string|null, status_until?: string|null, birth_date?: string|null }} row
 * @param {'client'|'staff'} side
 * @returns {string|null}
 */
export function profileStatusEmoji(row, side, now = new Date()) {
  if (side === 'client' && isBirthdayToday(row?.birth_date, todayInTimeZoneIso(CLUB_OPS_TIMEZONE, now))) return PROFILE_BIRTHDAY_EMOJI
  return activeOwnStatus(row, now)?.emoji ?? null
}
