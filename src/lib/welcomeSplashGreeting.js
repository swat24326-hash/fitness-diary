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
 * Имена с окончанием как у фамилий (-ина / -ин): иначе «Марина», «Екатерина»
 * ошибочно считаются фамилией.
 */
const GIVEN_NAME_LIKE_SURNAME = new Set(
  [
    'марина',
    'екатерина',
    'ирина',
    'полина',
    'ангелина',
    'карина',
    'галина',
    'алина',
    'милина',
    'кристина',
    'валентина',
    'каталина',
    'павлина',
    'янина',
  ].map((s) => s.replace(/ё/g, 'е')),
)

/**
 * Типичные русские фамилии по окончанию (Семенов, Смирнова, Ковальский…).
 * Имена вроде «Иван», «Мария», «Дмитрий», «Марина» сюда не попадают.
 * @param {string} token
 */
export function looksLikeRussianSurname(token) {
  const t = String(token ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (t.length < 3 || GIVEN_NAME_LIKE_SURNAME.has(t)) return false
  return /(ов|ова|ев|ева|ин|ина|ын|ына|ский|ская|цкий|цкая|енко|евич|ович|евна|овна|ук|юк|ян|дзе)$/i.test(t)
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

  // «Фамилия Имя …» (как карточка клиента / Москва) → имя.
  if (looksLikeRussianSurname(first) && !looksLikeRussianSurname(second)) {
    return normalizeOutreachName(second)
  }
  // «Имя Фамилия» (Клинцы) → имя.
  if (!looksLikeRussianSurname(first) && looksLikeRussianSurname(second)) {
    return normalizeOutreachName(first)
  }
  // Неясно (редкая фамилия без типичного окончания) — первое слово: «Александр Кукареко», «Захар Шкурат».
  // Ник+имя вроде «Алекса Артем» правим в карточке тренера, не эвристикой.
  if (!looksLikeRussianSurname(first)) {
    return normalizeOutreachName(first)
  }
  if (!looksLikeRussianSurname(second)) {
    return normalizeOutreachName(second)
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
