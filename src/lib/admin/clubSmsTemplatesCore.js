import {
  OUTREACH_SCENARIOS,
  OUTREACH_SCENARIO_LABELS,
  OUTREACH_TEMPLATE_LIMITS,
} from '../trainer/trainerClientOutreachCore.js'

/**
 * Шаблоны клубного SMS (Мои Звонки) — от имени клуба, не «это твой тренер».
 * Ключи сценариев те же, что у Max; тексты и обязательные плейсхолдеры — свои.
 */

/** Плейсхолдеры, полезные в SMS клуба */
export const CLUB_SMS_PLACEHOLDER_HINTS = [
  { key: '{client_name}', label: 'Имя клиента' },
  { key: '{club_name}', label: 'Название клуба' },
  { key: '{membership_name}', label: 'Название абонемента' },
  { key: '{days_left}', label: 'Дней до конца' },
  { key: '{days_word}', label: 'день / дня / дней' },
  { key: '{days_since_end}', label: 'Дней с конца абонемента' },
  { key: '{days_since_end_word}', label: 'день / дня / дней (с конца)' },
  { key: '{trainer_name}', label: 'Имя тренера (опционально — не пишите «это твой тренер»)' },
]

const REQUIRED_BY_SCENARIO = {
  birthdays: ['{client_name}', '{club_name}'],
  expiring: ['{client_name}', '{club_name}', '{membership_name}', '{days_left}', '{days_word}'],
  expired_recent: ['{client_name}', '{club_name}'],
  stale: ['{client_name}', '{club_name}'],
}

/** @returns {Record<string, string>} */
export function defaultClubSmsTemplates() {
  return {
    birthdays:
      'Привет, {client_name}! Это {club_name}. Поздравляем с днём рождения! Желаем здоровья и отличных тренировок. Ждём вас в зале!',
    expiring:
      'Привет, {client_name}! Это {club_name}. Ваша карта {membership_name} заканчивается через {days_left} {days_word}. Напишите нам или зайдите в клуб — продлим и сохраним удобное время.',
    expired_recent:
      'Привет, {client_name}! Это {club_name}. Ваш абонемент закончился. Продлите его, чтобы не прерывать занятия. Ждём вас в клубе!',
    stale:
      'Привет, {client_name}! Это {club_name}. Давно не видели вас в зале. Всё в порядке? Будем рады снова видеть вас на тренировках!',
  }
}

/**
 * @param {unknown} stored
 * @returns {Record<string, string>}
 */
export function resolveClubSmsTemplates(stored) {
  const defaults = defaultClubSmsTemplates()
  if (!stored || typeof stored !== 'object') return { ...defaults }
  const row = /** @type {Record<string, unknown>} */ (stored)
  /** @type {Record<string, string>} */
  const out = { ...defaults }
  for (const key of OUTREACH_SCENARIOS) {
    const t = String(row[key] ?? '').trim()
    if (t) out[key] = t.slice(0, OUTREACH_TEMPLATE_LIMITS.maxLength)
  }
  return out
}

/**
 * @param {unknown} stored
 * @returns {Record<string, string> | null}
 */
export function parseStoredClubSmsTemplates(stored) {
  if (stored == null) return null
  if (typeof stored !== 'object') return null
  const row = /** @type {Record<string, unknown>} */ (stored)
  const hasAny = OUTREACH_SCENARIOS.some((k) => String(row[k] ?? '').trim())
  if (!hasAny) return null
  return resolveClubSmsTemplates(stored)
}

/**
 * @param {unknown} templates
 * @returns {{ ok: true, templates: Record<string, string> | null } | { ok: false, error: string }}
 */
export function validateClubSmsTemplatesForSave(templates) {
  if (templates == null) return { ok: true, templates: null }

  if (typeof templates !== 'object') {
    return { ok: false, error: 'club_sms_templates должен быть объектом' }
  }

  const row = /** @type {Record<string, unknown>} */ (templates)
  const defaults = defaultClubSmsTemplates()
  /** @type {Record<string, string>} */
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
      return {
        ok: false,
        error: `SMS «${OUTREACH_SCENARIO_LABELS[key]}»: не длиннее ${OUTREACH_TEMPLATE_LIMITS.maxLength} символов`,
      }
    }
    for (const req of REQUIRED_BY_SCENARIO[key] ?? []) {
      if (!t.includes(req)) {
        return { ok: false, error: `SMS «${OUTREACH_SCENARIO_LABELS[key]}»: нужен плейсхолдер ${req}` }
      }
    }
    out[key] = t
    if (t !== defaults[key]) custom = true
  }

  if (!custom) return { ok: true, templates: null }
  return { ok: true, templates: out }
}

/** Club-дефолт не должен выдавать себя за сообщение тренера. */
export function clubSmsDefaultLooksLikeCoachVoice(text) {
  return /это\s+твой\s+тренер/i.test(String(text ?? ''))
}
