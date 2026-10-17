/**
 * Приветствие на стартовом splash: «Приветствуем, Дмитрий».
 * Без React. Обращение — имя, не фамилия (у сотрудников в name часто только фамилия).
 */

import { normalizeOutreachName } from './trainer/trainerClientOutreachCore.js'

/** Телефон / пустой логин — не подставляем в приветствие. */
function looksLikePhone(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return false
  return /^[\d+()\-\s.]{5,}$/.test(s) && !/[A-Za-zА-Яа-яЁё]/.test(s)
}

/**
 * Типичные русские фамилии по окончанию (Семенов, Смирнова, Ковальский…).
 * Имена вроде «Иван», «Мария», «Дмитрий» сюда не попадают.
 * @param {string} token
 */
export function looksLikeRussianSurname(token) {
  const t = String(token ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (t.length < 3) return false
  return /(ов|ова|ев|ева|ин|ина|ын|ына|ский|ская|цкий|цкая|енко|ук|юк|ян|дзе)$/i.test(t)
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

  const parts = s.split(/\s+/).filter(Boolean)
  if (!parts.length) return ''

  if (parts.length === 1) {
    const only = parts[0]
    // Одна фамилия в профиле сотрудника — лучше без имени, чем «Приветствуем, Семенов».
    if (looksLikeRussianSurname(only)) return ''
    return normalizeOutreachName(only)
  }

  const first = parts[0]
  const second = parts[1]

  // «Фамилия Имя …» (как карточка клиента) → имя.
  if (looksLikeRussianSurname(first) && !looksLikeRussianSurname(second)) {
    return normalizeOutreachName(second)
  }
  // «Имя Фамилия» → имя.
  if (!looksLikeRussianSurname(first) && looksLikeRussianSurname(second)) {
    return normalizeOutreachName(first)
  }
  // Оба / ни один не похожи на фамилию — берём второе (как в ФИО клуба).
  if (!looksLikeRussianSurname(second)) {
    return normalizeOutreachName(second)
  }
  if (!looksLikeRussianSurname(first)) {
    return normalizeOutreachName(first)
  }
  return ''
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
