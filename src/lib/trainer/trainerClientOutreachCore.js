import { daysUntilNextBirthday } from '../clientBirthdays.js'
import { membershipSignal } from '../clientListSignals.js'
import { pickUsableMembershipForDate } from '../membershipRules.js'
import { daysSinceIsoDate } from './trainerAttentionSummary.js'

/** Сценарии outreach = ключи быстрых фильтров тренера. */
export const OUTREACH_SCENARIOS = ['birthdays', 'expiring', 'expired_recent', 'stale']

export const OUTREACH_SCENARIO_LABELS = {
  birthdays: 'День рождения',
  expiring: 'Истекает абонемент',
  expired_recent: 'Абонемент закончился',
  stale: 'Давно не было',
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
 * @param {object[]} list
 * @param {string} todayIso
 */
export function pickRecentlyExpiredMembership(list, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  const candidates = (list ?? []).filter((m) => {
    const end = String(m?.end_date ?? '').slice(0, 10)
    if (!end || end > today) return false
    const days = daysSinceIsoDate(end, today)
    return days != null && days >= 0 && days <= 1
  })
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/**
 * @param {object[]} list
 * @param {string} todayIso
 */
export function isMembershipExpiredRecently(list, todayIso) {
  return pickRecentlyExpiredMembership(list, todayIso) != null
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
 * }} ctx
 */
export function clientMatchesOutreachFilter(scenario, ctx = {}) {
  const today = String(ctx.today ?? '').slice(0, 10)
  const memList = ctx.memList ?? []

  if (scenario === 'birthdays') return isBirthdayToday(ctx.birthDate, today)
  if (scenario === 'expiring') return membershipSignal(memList, today).key === 'expiring'
  if (scenario === 'expired_recent') return isMembershipExpiredRecently(memList, today)
  if (scenario === 'stale') return ctx.isStale === true
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
      'Привет, {client_name}! Это твой тренер {trainer_name}. Твой абонемент только что закончился. Давай продлим его на следующей тренировке, чтобы не прерывать процесс и сохранить темп. Когда тебя ждать?',
    stale:
      'Привет, {client_name}! Это твой тренер {trainer_name}. Что-то тебя давно не было видно на тренировках в {club_name}. Всё в порядке? Жду в зале, давай возвращаться в рабочий режим!',
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
  const greetingName = resolveClientGreetingName(ctx.client ?? ctx.clientName, ctx.outreachName)
  const vars = {
    '{client_name}': greetingName,
    '{trainer_name}': String(ctx.trainerName ?? '').trim() || 'Тренер',
    '{club_name}': String(ctx.clubName ?? '').trim() || 'клуб',
    '{membership_name}': String(ctx.membershipName ?? '').trim() || 'абонемент',
    '{days_left}': daysLeft != null ? String(daysLeft) : '3',
    '{days_word}': daysLeft != null ? daysWordRu(daysLeft) : 'дня',
  }
  return fillOutreachTemplate(template, vars)
}

/** @param {string} raw */
export function normalizePhoneDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '')
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
 *   client?: { name?: string, outreach_name?: string | null, phone?: string | null },
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

  let opened = false
  if (typeof window !== 'undefined') {
    try {
      window.open(buildMaxShareUrl(message), '_blank', 'noopener,noreferrer')
      opened = true
    } catch {
      opened = false
    }
  }

  return { ok: true, message, opened, phone }
}

/** @param {string} message @param {number} [maxLen=80] */
export function outreachMessagePreview(message, maxLen = 80) {
  const s = String(message ?? '').replace(/\s+/g, ' ').trim()
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1)}…`
}
