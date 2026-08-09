import { formatDateRu, todayLocalIso } from './dateRu.js'

const BIRTHDAY_WINDOW_DAYS = 30

/** @returns {{ month: number, day: number } | null} */
function parseBirthMonthDay(birthDateIso) {
  const s = String(birthDateIso ?? '').trim().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { month, day }
}

/** Следующая дата ДР (локальный календарь) как Date в полночь. */
function nextBirthdayDate(birthDateIso, todayIso = todayLocalIso()) {
  const md = parseBirthMonthDay(birthDateIso)
  if (!md) return null
  const [y, tm, td] = String(todayIso).slice(0, 10).split('-').map(Number)
  const today = new Date(y, tm - 1, td)
  let year = y
  let next = new Date(year, md.month - 1, md.day)
  if (next < today) {
    year += 1
    next = new Date(year, md.month - 1, md.day)
  }
  return next
}

/** Дней до ближайшего ДР (0 = сегодня). null — нет даты или невалидна. */
export function daysUntilNextBirthday(birthDateIso, todayIso = todayLocalIso()) {
  const next = nextBirthdayDate(birthDateIso, todayIso)
  if (!next) return null
  const [y, tm, td] = String(todayIso).slice(0, 10).split('-').map(Number)
  const today = new Date(y, tm - 1, td)
  return Math.round((next - today) / 86400000)
}

export function isBirthdayWithinNextDays(birthDateIso, todayIso = todayLocalIso(), maxDays = BIRTHDAY_WINDOW_DAYS) {
  const d = daysUntilNextBirthday(birthDateIso, todayIso)
  if (d == null) return false
  return d >= 0 && d <= maxDays
}

/** Фильтр списка «ДР»: сегодня + ближайшие в окне (чип считает только сегодня). */
export function isBirthdayBrowseMatch(birthDateIso, todayIso = todayLocalIso(), maxDays = BIRTHDAY_WINDOW_DAYS) {
  return isBirthdayWithinNextDays(birthDateIso, todayIso, maxDays)
}

export function upcomingBirthdayIso(birthDateIso, todayIso = todayLocalIso()) {
  const next = nextBirthdayDate(birthDateIso, todayIso)
  if (!next) return null
  const yy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function formatBirthdayCountdown(days) {
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} дн.`
}

/** Подпись для списка: «15.05.2026 (через 3 дн.)» */
export function formatUpcomingBirthdayLabel(birthDateIso, todayIso = todayLocalIso()) {
  const days = daysUntilNextBirthday(birthDateIso, todayIso)
  if (days == null) return null
  const iso = upcomingBirthdayIso(birthDateIso, todayIso)
  if (!iso) return null
  return `${formatDateRu(iso)} (${formatBirthdayCountdown(days)})`
}

/** Сортировка: ближайший ДР первым; без даты — в конец. */
export function compareByUpcomingBirthday(a, b, todayIso = todayLocalIso()) {
  const da = daysUntilNextBirthday(a?.birth_date, todayIso)
  const db = daysUntilNextBirthday(b?.birth_date, todayIso)
  if (da == null && db == null) return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru')
  if (da == null) return 1
  if (db == null) return -1
  if (da !== db) return da - db
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru')
}

export function sortClientsForBirthdayBrowse(clients, todayIso = todayLocalIso()) {
  return [...(clients ?? [])].sort((a, b) => compareByUpcomingBirthday(a, b, todayIso))
}

/**
 * @param {string | null | undefined} birthDateIso
 * @param {string} [todayIso]
 * @returns {'today' | 'upcoming' | null}
 */
export function birthdayBrowseSectionKey(birthDateIso, todayIso = todayLocalIso()) {
  const d = daysUntilNextBirthday(birthDateIso, todayIso)
  if (d === 0) return 'today'
  if (d != null && d >= 1 && d <= BIRTHDAY_WINDOW_DAYS) return 'upcoming'
  return null
}

export function birthdayBrowseSectionTitle(key) {
  if (key === 'today') return 'Сегодня'
  if (key === 'upcoming') return `Ближайшие ${BIRTHDAY_WINDOW_DAYS} дней`
  return ''
}

/**
 * Разбить отсортированный список на блоки для UI.
 * @param {object[]} clients
 * @param {string} [todayIso]
 * @returns {{ today: object[], upcoming: object[] }}
 */
export function partitionBirthdayBrowseClients(clients, todayIso = todayLocalIso()) {
  /** @type {object[]} */
  const today = []
  /** @type {object[]} */
  const upcoming = []
  for (const c of clients ?? []) {
    const key = birthdayBrowseSectionKey(c?.birth_date, todayIso)
    if (key === 'today') today.push(c)
    else if (key === 'upcoming') upcoming.push(c)
  }
  return {
    today: sortClientsForBirthdayBrowse(today, todayIso),
    upcoming: sortClientsForBirthdayBrowse(upcoming, todayIso),
  }
}

/**
 * Вставить заголовки секций в уже отсортированный список страницы.
 * @param {object[]} clients
 * @param {string} [todayIso]
 * @returns {Array<{ type: 'section', key: string, title: string } | { type: 'client', client: object }>}
 */
export function withBirthdayBrowseSectionBreaks(clients, todayIso = todayLocalIso(), sectionCounts = null) {
  /** @type {Array<{ type: 'section', key: string, title: string, count?: number } | { type: 'client', client: object }>} */
  const out = []
  let last = /** @type {string | null} */ (null)
  for (const c of clients ?? []) {
    const key = birthdayBrowseSectionKey(c?.birth_date, todayIso)
    if (key && key !== last) {
      const count =
        sectionCounts && typeof sectionCounts === 'object' ? Number(sectionCounts[key]) || 0 : undefined
      out.push({
        type: 'section',
        key,
        title: birthdayBrowseSectionTitle(key),
        ...(count != null ? { count } : {}),
      })
      last = key
    }
    out.push({ type: 'client', client: c })
  }
  return out
}

export { BIRTHDAY_WINDOW_DAYS }
