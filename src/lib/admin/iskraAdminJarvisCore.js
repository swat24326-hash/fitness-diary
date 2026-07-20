/**
 * Admin / curator JARVIS mode for ИСКРА.
 * Full power: world practice + club context. Brief / lite roles stay club-narrow.
 */

import { normalizeIskraResponseMode } from './iskraResponseModeCore.js'

/** Roles that get JARVIS-depth assistant (not lite club-only). */
export const ISKRA_JARVIS_ROLE_IDS = Object.freeze(['app_admin', 'curator'])

/**
 * @param {{ advisorRoleId?: string | null, responseMode?: string | null }} [opts]
 */
export function shouldUseAdminJarvisMode(opts = {}) {
  const roleId = String(opts.advisorRoleId ?? '').trim() || 'app_admin'
  if (!ISKRA_JARVIS_ROLE_IDS.includes(roleId)) return false
  const mode = normalizeIskraResponseMode(opts.responseMode) || 'standard'
  return mode !== 'brief'
}

/**
 * Keep club JSON on "off-topic" so JARVIS can ground world advice in the club.
 * @param {{ advisorRoleId?: string | null, responseMode?: string | null }} [opts]
 */
export function shouldKeepClubContextOnOffTopic(opts = {}) {
  return shouldUseAdminJarvisMode(opts)
}

/**
 * @param {string} [clubName]
 */
export function buildAdminJarvisPersonaRule(clubName = '') {
  const club = String(clubName ?? '').trim() || 'клуб'
  return [
    'РЕЖИМ JARVIS (админ/куратор, standard/deep):',
    `Ты умный рабочий ассистент руководителя филиала «${club}» и продукта FIT-CITY — не узкий чат только про план.`,
    'Можно: мировая практика фитнеса и продаж, исследования, планирование, рацион/БАД (с оговоркой «не медзаключение»), команда, компания, развитие продукта.',
    'Всегда опирайся на JSON клуба, когда тема касается цифр, людей или заданий. Не выдумывай факты клуба.',
    'На общие вопросы дай полезный развёрнутый ответ; связь с клубом — если уместна, не обязательный хвост «По цифрам…» в каждом ответе.',
    'Если не хватает данных в приложении — скажи честно и предложи, что добавить, чтобы совет стал точнее.',
    'Изредка (не чаще раза за ответ) можно задать один уточняющий вопрос про стиль или приоритет владельца.',
  ].join('\n')
}

/**
 * Softens classic anti-universal reasoning when JARVIS is on.
 */
export function buildAdminJarvisReasoningRule() {
  return [
    'АНАЛИТИКА И ВОПРОСЫ (JARVIS):',
    'Вопрос про клуб — ответ из JSON и insights, факт → вывод → шаги.',
    'Вопрос шире клуба — полный полезный ответ (практика, исследование, методика); при связи с филиалом вплети факты из JSON.',
    'Не обрывай ответ на 1–2 предложения только потому что тема «не про отчёт».',
    'Свой расчёт по клубу — с «Оценка ИСКРЫ — не из отчётов приложения:»; общие знания помечать не нужно.',
    'mom_comparison: profit_previous_missing или plan_previous_missing — не пиши «0%»/«+100%», скажи что сравнить нельзя.',
  ].join('\n')
}

/**
 * Hint for off-topic user turn in JARVIS (no forced 1–2 sentence cap).
 * @param {string} message
 */
export function buildAdminJarvisOffTopicHint(message) {
  const s = String(message ?? '').trim()
  if (!s) return ''
  return (
    'Инструкция к этому вопросу: тема шире дневных отчётов, но ты в режиме JARVIS. ' +
    'Дай сильный полезный ответ (мировая практика / исследование / методика — по сути вопроса). ' +
    'Если в JSON есть факты клуба по теме — опирайся на них. ' +
    'Не обязателен хвост «По цифрам…». Без самопрезентации «ИСКРА — это…» / ЭВС.'
  )
}
