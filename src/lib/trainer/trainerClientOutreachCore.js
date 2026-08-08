import { daysUntilNextBirthday } from '../clientBirthdays.js'
import { membershipSignal } from '../clientListSignals.js'
import { hasUpcomingMembership, pickUsableMembershipForDate, isMembershipDepletedInPeriod, pickDepletedMembershipInPeriod } from '../membershipRules.js'
import { todayLocalIso } from '../dateRu.js'

/** @param {number} n */
export function daysWordRu(n) {
  const x = Math.abs(Number(n))
  const mod10 = x % 10
  const mod100 = x % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня'
  return 'дней'
}

/**
 * @param {string} iso
 * @param {string} todayIso
 * @returns {number | null}
 */
export function daysSinceIsoDate(iso, todayIso = todayLocalIso()) {
  const d = String(iso ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const [y1, m1, d1] = d.split('-').map(Number)
  const [y2, m2, d2] = String(todayIso).slice(0, 10).split('-').map(Number)
  const t0 = Date.UTC(y1, m1 - 1, d1)
  const t1 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t1 - t0) / 86400000)
}

/** Сценарии outreach = ключи быстрых фильтров тренера. */
export const OUTREACH_SCENARIOS = ['birthdays', 'expiring', 'expired_recent', 'stale']

/** Дней после конца абонемента — переход из «закончился» в «давно не был». */
export const STALE_TRAINING_DAYS = 14

/**
 * Верхняя граница «давно не был» (включительно).
 * После этого дня клиент остаётся только в «Не активные» (учёт), не в очереди холодного возврата.
 */
export const STALE_MAX_DAYS = 60

/**
 * «Не активные» на сегодня (учёт): нет usable-абона и не ждёт старт.
 * Не ПНК и не архив. Список — в Клиентах (`?filter=inactive`), не outreach Max.
 * @param {{ lifecycle?: string | null, archived_at?: string | null } | null | undefined} client
 * @param {object[]} memList
 * @param {string} [todayIso]
 */
export function isTrainerClientInactiveToday(client, memList, todayIso = todayLocalIso()) {
  if (client?.archived_at) return false
  if (String(client?.lifecycle ?? '') === 'pnk') return false
  const today = String(todayIso ?? '').slice(0, 10)
  if (pickUsableMembershipForDate(memList ?? [], today)) return false
  if (hasUpcomingMembership(memList ?? [], today)) return false
  return true
}

export const OUTREACH_SCENARIO_LABELS = {
  birthdays: 'День рождения',
  expiring: 'Истекает абонемент',
  expired_recent: 'Абонемент закончился',
  stale: 'Абонемент давно закончился',
}

/** @typedef {'birthdays'|'expiring'|'expired_recent'|'stale'} OutreachScenario */

/**
 * @param {string} filter
 * @returns {filter is OutreachScenario}
 */
export function isOutreachScenario(filter) {
  return OUTREACH_SCENARIOS.includes(String(filter ?? ''))
}

/** Инициалы вроде «Р.», «Р.А.», «А» — не имя для обращения. */
export function isNameInitialsToken(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return true
  if (/^[A-Za-zА-Яа-яЁё]\.([A-Za-zА-Яа-яЁё]\.)*$/u.test(raw)) return true
  const letters = raw.replace(/\./g, '')
  if (letters.length === 1 && /^[A-Za-zА-Яа-яЁё]$/u.test(letters)) return true
  if (raw.includes('.') && letters.length <= 3 && /^[A-Za-zА-Яа-яЁё]+$/u.test(letters)) return true
  return false
}

/** @param {string} raw */
export function normalizeOutreachName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  // одно слово для обращения; отсекаем мусор
  const first = s.split(/\s+/)[0]
  if (!first || isNameInitialsToken(first)) return ''
  return first.slice(0, 40)
}

/**
 * Имя для «Привет, …» из формата карточки «Фамилия Имя|И.О.».
 * Второе слово целиком → обращение; только инициалы / одно слово → ''.
 * @param {string} name
 */
export function extractGreetingNameFromClientName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) return ''
  const second = parts[1]
  if (isNameInitialsToken(second)) return ''
  return normalizeOutreachName(second)
}

/**
 * Приоритет: outreach_name (явно в карточке) → умный разбор ФИО → '' (сообщение без имени).
 * @param {{ name?: string, outreach_name?: string | null } | string | null | undefined} clientOrName
 * @param {string | null | undefined} [outreachNameOverride]
 */
export function resolveClientGreetingName(clientOrName, outreachNameOverride) {
  const fromOverride = normalizeOutreachName(outreachNameOverride)
  if (fromOverride) return fromOverride

  if (clientOrName && typeof clientOrName === 'object') {
    const stored = normalizeOutreachName(clientOrName.outreach_name)
    if (stored) return stored
    return extractGreetingNameFromClientName(clientOrName.name)
  }

  return extractGreetingNameFromClientName(clientOrName)
}

/**
 * @deprecated используйте resolveClientGreetingName / extractGreetingNameFromClientName
 * @param {string} name
 */
export function extractClientFirstName(name) {
  return extractGreetingNameFromClientName(name)
}

/**
 * Подстановка {client_name}: пустое имя → «Привет, {client_name}!» становится «Привет!»
 * @param {string} template
 * @param {string} greetingName
 */
export function applyClientNamePlaceholder(template, greetingName) {
  let out = String(template ?? '')
  const name = String(greetingName ?? '').trim()
  if (name) return out.split('{client_name}').join(name)
  out = out.replace(/,\s*\{client_name\}/g, '')
  out = out.replace(/\{client_name\}/g, '')
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Последний по end_date абонемент, который уже закончился (end ≤ сегодня).
 * @param {object[]} list
 * @param {string} todayIso
 */
export function pickLatestEndedMembership(list, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  const ended = (list ?? []).filter((m) => {
    const end = String(m?.end_date ?? '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(end) && end <= today
  })
  if (!ended.length) return null
  return ended.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/**
 * @param {object[]} list
 * @param {string} todayIso
 * @returns {number | null}
 */
export function membershipDaysSinceLatestEnd(list, todayIso) {
  const latestEnded = pickLatestEndedMembership(list, todayIso)
  if (!latestEnded) return null
  return daysSinceIsoDate(latestEnded.end_date, todayIso)
}

/**
 * «Закончился» — горячее продление:
 * - срок абона вышел 0 … (staleDays − 1) дней назад, или
 * - лимит тренировок исчерпан, а календарный срок ещё идёт (пакет с total > 0).
 * На 14-й день после конца даты клиент переходит в «давно не был».
 * ТЗ/календарь без лимита занятий (`total_trainings = 0`) сюда по лимиту не попадает.
 *
 * @param {object[]} list
 * @param {string} todayIso
 * @param {number} [staleDays]
 */
export function isMembershipExpiredRecently(list, todayIso, staleDays = STALE_TRAINING_DAYS) {
  const today = String(todayIso ?? '').slice(0, 10)
  const threshold = Number(staleDays) > 0 ? Number(staleDays) : STALE_TRAINING_DAYS
  if (pickUsableMembershipForDate(list ?? [], today)) return false
  // Уже куплен следующий абонемент — не «закончился» для возврата/продажи.
  if (hasUpcomingMembership(list ?? [], today)) return false
  // Горячий: тренировки кончились, срок ещё действует.
  if (isMembershipDepletedInPeriod(list, today)) return true
  const days = membershipDaysSinceLatestEnd(list, today)
  if (days == null) return false
  return days >= 0 && days < threshold
}

/**
 * @param {object[]} list
 * @param {string} todayIso
 * @param {number} [staleDays]
 */
export function pickRecentlyExpiredMembership(list, todayIso, staleDays = STALE_TRAINING_DAYS) {
  if (!isMembershipExpiredRecently(list, todayIso, staleDays)) return null
  const depleted = pickDepletedMembershipInPeriod(list, todayIso)
  if (depleted) return depleted
  return pickLatestEndedMembership(list, todayIso)
}

/**
 * «Давно не был»: абонемент закончился staleDays…staleMaxDays дней назад (включительно).
 * @param {{
 *   memList?: object[],
 *   today?: string,
 *   staleDays?: number,
 *   staleMaxDays?: number,
 * }} ctx
 */
export function isClientStaleForAttention(ctx = {}) {
  const today = String(ctx.today ?? todayLocalIso())
  const staleDays = Number(ctx.staleDays) > 0 ? Number(ctx.staleDays) : STALE_TRAINING_DAYS
  const staleMaxDays = Number(ctx.staleMaxDays) > 0 ? Number(ctx.staleMaxDays) : STALE_MAX_DAYS
  const memList = ctx.memList ?? []

  if (pickUsableMembershipForDate(memList, today)) return false
  if (hasUpcomingMembership(memList, today)) return false
  if (isMembershipExpiredRecently(memList, today, staleDays)) return false

  const days = membershipDaysSinceLatestEnd(memList, today)
  if (days == null) return false
  return days >= staleDays && days <= staleMaxDays
}

/**
 * @param {object[]} list
 * @param {string} todayIso
 * @returns {number | null}
 */
export function membershipDaysUntilEnd(list, todayIso) {
  const active = pickUsableMembershipForDate(list ?? [], todayIso)
  if (!active?.end_date) return null
  const end = new Date(String(active.end_date).slice(0, 10))
  const d0 = new Date(String(todayIso).slice(0, 10))
  return Math.ceil((end - d0) / 86400000)
}

/** @param {string | null | undefined} birthDateIso @param {string} todayIso */
export function isBirthdayToday(birthDateIso, todayIso) {
  return daysUntilNextBirthday(birthDateIso, todayIso) === 0
}

/**
 * @param {OutreachScenario} scenario
 * @param {{
 *   birthDate?: string | null,
 *   memList?: object[],
 *   today?: string,
 *   isStale?: boolean,
 *   staleDays?: number,
 *   staleMaxDays?: number,
 * }} ctx
 */
export function clientMatchesOutreachFilter(scenario, ctx = {}) {
  const today = String(ctx.today ?? '').slice(0, 10)
  const memList = ctx.memList ?? []

  if (scenario === 'birthdays') return isBirthdayToday(ctx.birthDate, today)
  if (scenario === 'expiring') return membershipSignal(memList, today).key === 'expiring'
  if (scenario === 'expired_recent') return isMembershipExpiredRecently(memList, today)
  if (scenario === 'stale') {
    return isClientStaleForAttention({
      memList,
      today,
      staleDays: ctx.staleDays,
      staleMaxDays: ctx.staleMaxDays,
    })
  }
  return false
}

export const OUTREACH_TEMPLATE_LIMITS = {
  maxLength: 500,
}

export const OUTREACH_PLACEHOLDER_HINTS = [
  { key: '{client_name}', label: 'Имя клиента' },
  { key: '{trainer_name}', label: 'Имя тренера' },
  { key: '{club_name}', label: 'Название клуба' },
  { key: '{membership_name}', label: 'Название абонемента (истекает)' },
  { key: '{days_left}', label: 'Дней до конца (истекает)' },
  { key: '{days_word}', label: 'день / дня / дней (истекает)' },
  { key: '{days_since_end}', label: 'Дней с конца абонемента' },
  { key: '{days_since_end_word}', label: 'день / дня / дней (с конца)' },
]

const REQUIRED_BY_SCENARIO = {
  birthdays: ['{client_name}', '{trainer_name}', '{club_name}'],
  expiring: ['{client_name}', '{trainer_name}', '{membership_name}', '{days_left}', '{days_word}'],
  expired_recent: ['{client_name}', '{trainer_name}'],
  stale: ['{client_name}', '{trainer_name}', '{club_name}'],
}

/** @returns {Record<OutreachScenario, string>} */
export function defaultOutreachTemplates() {
  return {
    birthdays:
      'Привет, {client_name}! Это твой тренер {trainer_name}. Поздравляю с днём рождения! Желаю отличного настроения, крепкого здоровья и новых крутых результатов. Жду на следующую тренировку в {club_name}!',
    expiring:
      'Привет, {client_name}! Это твой тренер {trainer_name}. Напоминаю, что твоя карта {membership_name} заканчивается через {days_left} {days_word}. Давай на следующей тренировке всё продлим, чтобы забронировать за тобой удобное время.',
    expired_recent:
      'Привет, {client_name}! Это твой тренер {trainer_name}. Твой абонемент закончился. Давай продлим его на следующей тренировке, чтобы не прерывать процесс и сохранить темп. Когда тебя ждать?',
    stale:
      'Привет, {client_name}! Это твой тренер {trainer_name}. Твой абонемент в {club_name} закончился уже давно. Всё в порядке? Жду в зале — давай вернёмся и продолжим!',
  }
}

/**
 * @param {unknown} stored
 * @returns {Record<OutreachScenario, string>}
 */
export function resolveOutreachTemplates(stored) {
  const defaults = defaultOutreachTemplates()
  if (!stored || typeof stored !== 'object') return { ...defaults }
  const row = /** @type {Record<string, unknown>} */ (stored)
  /** @type {Record<OutreachScenario, string>} */
  const out = { ...defaults }
  for (const key of OUTREACH_SCENARIOS) {
    const t = String(row[key] ?? '').trim()
    if (t) out[key] = t.slice(0, OUTREACH_TEMPLATE_LIMITS.maxLength)
  }
  return out
}

/**
 * @param {unknown} stored
 * @returns {Record<OutreachScenario, string> | null}
 */
export function parseStoredOutreachTemplates(stored) {
  if (stored == null) return null
  if (typeof stored !== 'object') return null
  const row = /** @type {Record<string, unknown>} */ (stored)
  const hasAny = OUTREACH_SCENARIOS.some((k) => String(row[k] ?? '').trim())
  if (!hasAny) return null
  return resolveOutreachTemplates(stored)
}

/**
 * @param {unknown} templates
 * @returns {{ ok: true, templates: Record<OutreachScenario, string> | null } | { ok: false, error: string }}
 */
export function validateOutreachTemplatesForSave(templates) {
  if (templates == null) return { ok: true, templates: null }

  if (typeof templates !== 'object') {
    return { ok: false, error: 'outreach_templates должен быть объектом' }
  }

  const row = /** @type {Record<string, unknown>} */ (templates)
  const defaults = defaultOutreachTemplates()
  /** @type {Record<OutreachScenario, string>} */
  const out = {}
  let custom = false

  for (const key of OUTREACH_SCENARIOS) {
    const raw = row[key]
    if (raw == null || raw === '') {
      out[key] = defaults[key]
      continue
    }
    const t = String(raw).trim()
    if (!t) {
      out[key] = defaults[key]
      continue
    }
    if (t.length > OUTREACH_TEMPLATE_LIMITS.maxLength) {
      return { ok: false, error: `Шаблон «${OUTREACH_SCENARIO_LABELS[key]}»: не длиннее ${OUTREACH_TEMPLATE_LIMITS.maxLength} символов` }
    }
    for (const req of REQUIRED_BY_SCENARIO[key] ?? []) {
      if (!t.includes(req)) {
        return { ok: false, error: `Шаблон «${OUTREACH_SCENARIO_LABELS[key]}»: нужен плейсхолдер ${req}` }
      }
    }
    out[key] = t
    if (t !== defaults[key]) custom = true
  }

  if (!custom) return { ok: true, templates: null }
  return { ok: true, templates: out }
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function fillOutreachTemplate(template, vars) {
  let out = String(template ?? '')
  const clientName = vars['{client_name}']
  if (Object.prototype.hasOwnProperty.call(vars, '{client_name}')) {
    out = applyClientNamePlaceholder(out, clientName)
  }
  for (const [key, val] of Object.entries(vars)) {
    if (key === '{client_name}') continue
    out = out.split(key).join(String(val ?? ''))
  }
  return out.trim()
}

/**
 * @param {OutreachScenario} scenario
 * @param {{
 *   client?: { name?: string, outreach_name?: string | null },
 *   clientName?: string,
 *   outreachName?: string | null,
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   memList?: object[],
 *   today?: string,
 *   templates?: Record<OutreachScenario, string> | null,
 * }} ctx
 */
export function buildOutreachMessage(scenario, ctx = {}) {
  const templates = ctx.templates ? resolveOutreachTemplates(ctx.templates) : defaultOutreachTemplates()
  const template = templates[scenario] ?? defaultOutreachTemplates()[scenario]
  const today = String(ctx.today ?? '').slice(0, 10)
  const daysLeft = membershipDaysUntilEnd(ctx.memList ?? [], today)
  const daysSinceEnd = membershipDaysSinceLatestEnd(ctx.memList ?? [], today)
  const greetingName = resolveClientGreetingName(ctx.client ?? ctx.clientName, ctx.outreachName)
  const vars = {
    '{client_name}': greetingName,
    '{trainer_name}': String(ctx.trainerName ?? '').trim() || 'Тренер',
    '{club_name}': String(ctx.clubName ?? '').trim() || 'клуб',
    '{membership_name}': String(ctx.membershipName ?? '').trim() || 'абонемент',
    '{days_left}': daysLeft != null ? String(daysLeft) : '3',
    '{days_word}': daysLeft != null ? daysWordRu(daysLeft) : 'дня',
    '{days_since_end}': daysSinceEnd != null ? String(daysSinceEnd) : '14',
    '{days_since_end_word}': daysSinceEnd != null ? daysWordRu(daysSinceEnd) : 'дней',
  }
  return fillOutreachTemplate(template, vars)
}

/** @param {string} raw */
export function normalizePhoneDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

/** @param {string} raw */
export function formatPhoneE164Ru(raw) {
  const d = normalizePhoneDigits(raw)
  if (d.length === 11 && d.startsWith('7')) return `+${d}`
  if (d.length === 10) return `+7${d}`
  if (d.length > 11 && d.startsWith('7')) return `+${d}`
  return ''
}

/**
 * Прямая ссылка на чат Max (max.ru/u/… или max.ru/@…).
 * @param {string | null | undefined} raw
 */
export function normalizeMaxChatUrl(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
    const u = new URL(withProto)
    const host = u.hostname.replace(/^www\./, '')
    if (host !== 'max.ru' && host !== 'web.max.ru') return ''
    const path = u.pathname.replace(/\/+$/, '')
    if (path.startsWith('/u/') || path.startsWith('/@') || /^\/id[\d_a-z-]+/i.test(path)) {
      return `https://max.ru${path}`
    }
  } catch {
    return ''
  }
  return ''
}

/**
 * @param {{ message: string, phone?: string, maxChatUrl?: string | null }} input
 * @returns {{ url: string, mode: 'direct_chat' | 'share' }}
 */
export function resolveMaxOpenTarget(input = {}) {
  const message = String(input.message ?? '')
  const direct = normalizeMaxChatUrl(input.maxChatUrl)
  if (direct) {
    return { url: direct, mode: 'direct_chat' }
  }
  return { url: buildMaxShareUrl(message), mode: 'share' }
}

/** @param {string} url */
export function openMaxExternalUrl(url) {
  if (typeof window === 'undefined' || !url) return false
  try {
    window.location.assign(url)
    return true
  } catch {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    } catch {
      return false
    }
  }
}

/** @param {string} text */
export function buildMaxShareUrl(text) {
  return `https://max.ru/:share?text=${encodeURIComponent(String(text ?? ''))}`
}

/** @param {string} text */
export async function copyTextToClipboard(text) {
  const value = String(text ?? '')
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  if (typeof document === 'undefined') throw new Error('Буфер обмена недоступен')
  const ta = document.createElement('textarea')
  ta.value = value
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

/**
 * @param {OutreachScenario} scenario
 * @param {{
 *   client?: { name?: string, outreach_name?: string | null, phone?: string | null, max_chat_url?: string | null },
 *   memList?: object[],
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   today?: string,
 *   templates?: Record<OutreachScenario, string> | null,
 * }} ctx
 */
export async function runOutreachToMax(scenario, ctx = {}) {
  const phone = normalizePhoneDigits(ctx.client?.phone)
  if (!phone) return { ok: false, error: 'no_phone' }

  const message = buildOutreachMessage(scenario, {
    client: ctx.client,
    trainerName: ctx.trainerName,
    clubName: ctx.clubName,
    membershipName: ctx.membershipName,
    memList: ctx.memList,
    today: ctx.today,
    templates: ctx.templates,
  })

  try {
    await copyTextToClipboard(message)
  } catch {
    return { ok: false, error: 'copy_failed', message }
  }

  const maxChatUrl = normalizeMaxChatUrl(ctx.client?.max_chat_url)
  const target = resolveMaxOpenTarget({ message, phone, maxChatUrl })

  let opened = false
  if (typeof window !== 'undefined') {
    opened = openMaxExternalUrl(target.url)
  }

  return {
    ok: true,
    message,
    opened,
    phone,
    maxChatUrl: maxChatUrl || null,
    openMode: target.mode,
  }
}

/** @param {string} message @param {number} [maxLen=80] */
export function outreachMessagePreview(message, maxLen = 80) {
  const s = String(message ?? '').replace(/\s+/g, ' ').trim()
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1)}…`
}
