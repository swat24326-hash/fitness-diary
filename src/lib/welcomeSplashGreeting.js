/**
 * Приветствие на стартовом splash: «Приветствуем, Дмитрий».
 * Без React. Имя — короткое обращение, не полное ФИО.
 */

import {
  extractGreetingNameFromClientName,
  normalizeOutreachName,
} from './trainer/trainerClientOutreachCore.js'

/** Телефон / пустой логин — не подставляем в приветствие. */
function looksLikePhone(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return false
  return /^[\d+()\-\s.]{5,}$/.test(s) && !/[A-Za-zА-Яа-яЁё]/.test(s)
}

/**
 * Короткое имя для splash из displayName / user.name / логина.
 * @param {string} raw
 * @returns {string}
 */
export function resolveWelcomeGreetingName(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s || looksLikePhone(s)) return ''

  if (s.includes('@')) {
    return normalizeOutreachName(s.split('@')[0])
  }

  const fromFio = extractGreetingNameFromClientName(s)
  if (fromFio) return fromFio

  return normalizeOutreachName(s.split(/\s+/)[0])
}

/**
 * @param {string} greetingName
 * @returns {string} «Приветствуем» или «Приветствуем, Дмитрий»
 */
export function formatWelcomeGreeting(greetingName) {
  const name = String(greetingName ?? '').trim()
  if (!name) return 'Приветствуем'
  return `Приветствуем, ${name}`
}
