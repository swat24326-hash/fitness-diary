/**
 * Делает текст ИСКРЫ естественным для TTS: даты, счётчики, интонация.
 * Чистые функции — тестируются из scripts/verify-gemini-analytics.mjs.
 */

import { integerToRussianWords, prepareNumbersForSpeech } from './iskraReplyPhrasing.js'

function pluralRu(n, one, few, many) {
  const abs = Math.abs(Math.trunc(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

const RU_TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
]
const RU_ORD_ONES_GEN = [
  '',
  'первого',
  'второго',
  'третьего',
  'четвёртого',
  'пятого',
  'шестого',
  'седьмого',
  'восьмого',
  'девятого',
]
const RU_ORD_TEENS_GEN = [
  'десятого',
  'одиннадцатого',
  'двенадцатого',
  'тринадцатого',
  'четырнадцатого',
  'пятнадцатого',
  'шестнадцатого',
  'семнадцатого',
  'восемнадцатого',
  'девятнадцатого',
]

const RU_MONTHS =
  'январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь'

/** @param {number} tail 0–99 */
function yearTailGenitive(tail) {
  const num = Math.abs(Math.trunc(tail)) % 100
  if (num === 0) return ''
  const tens = Math.floor(num / 10)
  const units = num % 10
  if (tens === 1) return RU_ORD_TEENS_GEN[units]
  const parts = []
  if (tens > 1) parts.push(RU_TENS[tens])
  if (units > 0) parts.push(RU_ORD_ONES_GEN[units])
  return parts.join(' ')
}

/** @param {number|string} year */
export function speakYearGenitiveForSpeech(year) {
  const y = Math.trunc(Number(year))
  if (!Number.isFinite(y)) return ''
  if (y >= 2000 && y < 3000) {
    const tail = y % 100
    if (tail === 0) return 'двухтысячного'
    const tailWords = yearTailGenitive(tail)
    return tailWords ? `две тысячи ${tailWords}` : 'две тысячи'
  }
  if (y >= 1900 && y < 2000) {
    const tail = y % 100
    const tailWords = yearTailGenitive(tail)
    return tailWords ? `тысяча девятьсот ${tailWords}` : 'тысяча девятьсот'
  }
  return integerToRussianWords(y) || String(y)
}

/**
 * @param {number|string} n
 * @param {string} one
 * @param {string} few
 * @param {string} many
 */
export function speakCountForSpeech(n, one, few, many) {
  const num = Math.trunc(Number(n))
  if (!Number.isFinite(num)) return `${one}`
  const words = integerToRussianWords(Math.abs(num)) || 'ноль'
  return `${words} ${pluralRu(num, one, few, many)}`
}

/** @param {string} text */
export function prepareDatesForSpeech(text) {
  let s = String(text ?? '')
  const monthRe = new RegExp(`(${RU_MONTHS})\\s*,?\\s*(\\d{4})(?=\\s|[,.!?;:]|$)`, 'gi')
  s = s.replace(monthRe, (_, month, year) => {
    const yearSpeech = speakYearGenitiveForSpeech(year)
    return `${month} ${yearSpeech} года`
  })
  return s
}

/** @param {string} text */
export function prepareCountsForSpeech(text) {
  let s = String(text ?? '')

  s = s.replace(/(\d+)\s+из\s+(\d+)/gi, (_, a, b) => {
    const left = integerToRussianWords(parseInt(a, 10)) || a
    const right = integerToRussianWords(parseInt(b, 10)) || b
    return `${left} из ${right}`
  })

  const countPatterns = [
    [/(\d+)\s+клиент(?:ов|а|ы)?/gi, 'клиент', 'клиента', 'клиентов'],
    [/(\d+)\s+отчёт(?:ов|а)?/gi, 'отчёт', 'отчёта', 'отчётов'],
    [/(\d+)\s+трениров(?:ок|ки|ка)?/gi, 'тренировка', 'тренировки', 'тренировок'],
    [/(\d+)\s+дн(?:ей|я|ь)/gi, 'день', 'дня', 'дней'],
    [/(\d+)\s+абонемент(?:ов|а)?/gi, 'абонемент', 'абонемента', 'абонементов'],
  ]

  for (const [re, one, few, many] of countPatterns) {
    s = s.replace(re, (_, raw) => speakCountForSpeech(raw, one, few, many))
  }

  return s
}

/** @param {string} text */
export function prepareSpeechLexicon(text) {
  let s = String(text ?? '')

  s = s
    .replace(/\bЗП\b/g, 'зарплата')
    .replace(/\bЭВМ\b/g, 'электронно-вычислительная машина')
    .replace(/\bЭВС\b/g, 'электронно-вычислительная система')
    .replace(/\bПНК\b/g, 'потенциальные новые клиенты')
    .replace(/\bvs\b/gi, 'против')
    .replace(/\bAPI\b/gi, 'эй-пи-ай')

  return s
}

/**
 * Микропаузы и мягкие связки — TTS меньше «роботит».
 * @param {string} text
 */
export function prepareProsodyForSpeech(text) {
  let s = String(text ?? '')

  s = s
    .replace(/ИСКРА:\s*/gi, 'ИСКРА, ')
    .replace(/ИСКРА\.\s+/g, 'ИСКРА, ')
    .replace(/\s+На связи\./gi, ', на связи.')
    .replace(/\s+на связи\./gi, ', на связи.')
    .replace(/\s+Готова к следующему запросу\./gi, ', готова к следующему запросу.')
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    .replace(/,\s*,/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
}

/**
 * Полный проход «очеловечивания» после базовой подготовки чисел и аббревиатур.
 * @param {string} text
 */
export function naturalizeTextForSpeech(text) {
  let s = String(text ?? '')
  s = prepareSpeechLexicon(s)
  s = prepareDatesForSpeech(s)
  s = prepareCountsForSpeech(s)
  s = prepareNumbersForSpeech(s)
  s = prepareProsodyForSpeech(s)
  return s
}
