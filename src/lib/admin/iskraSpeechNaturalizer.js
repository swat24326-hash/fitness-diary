/**
 * Максимальное «очеловечивание» TTS ИСКРЫ в рамках браузерного speechSynthesis.
 * Чистые функции — scripts/verify-gemini-analytics.mjs.
 */

import {
  integerToRussianWords,
  prepareNumbersForSpeech,
  speakPercentForSpeech,
  speakRubAmountForSpeech,
} from './iskraReplyPhrasing.js'

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
const RU_ORD_ONES_NOM = [
  '',
  'первый',
  'второй',
  'третий',
  'четвёртый',
  'пятый',
  'шестой',
  'седьмой',
  'восьмой',
  'девятый',
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
export function prepareSpeechLexicon(text) {
  let s = String(text ?? '')

  s = s
    .replace(/\bЗП\b/g, 'зарплата')
    .replace(/\bЭВМ\b/g, 'электронно-вычислительная машина')
    .replace(/\bЭВС\b/g, 'электронно-вычислительная система')
    .replace(/\bПНК\b/g, 'потенциальные новые клиенты')
    .replace(/\bПЗ\b/g, 'персональный зал')
    .replace(/\bТЗ\b/g, 'тренажёрный зал')
    .replace(/\bАЗ\b/g, 'аэробный зал')
    .replace(/\bНК\b/g, 'новые клиенты')
    .replace(/\bДК\b/g, 'действующие клиенты')
    .replace(/\bУК\b/g, 'уходящие клиенты')
    .replace(/\bvs\b/gi, 'против')
    .replace(/\bAPI\b/gi, 'эй-пи-ай')
    .replace(/\bOK\b/gi, 'окей')
    .replace(/\bCRM\b/gi, 'си-ар-эм')

  return s.replace(/\s+/g, ' ').trim()
}

/** @param {string} text */
export function prepareDatesForSpeech(text) {
  let s = String(text ?? '')
  const monthRe = new RegExp(`(${RU_MONTHS})\\s*,?\\s*(\\d{4})(?=[\\s,.!?;:]|$)`, 'gi')
  s = s.replace(monthRe, (_, month, year) => {
    const yearSpeech = speakYearGenitiveForSpeech(year)
    return `${month} ${yearSpeech} года`
  })
  s = s.replace(/за\s+(\d{4})\s+год(?=[\s,.!?;:]|$)/gi, (_, year) => {
    return `за ${speakYearGenitiveForSpeech(year)} года`
  })
  return s
}

/** @param {string} text */
export function prepareDeltasForSpeech(text) {
  let s = String(text ?? '')
  s = s.replace(/[+＋]\s*(\d+(?:[.,]\d+)?)\s*%/g, (_, raw) => `плюс ${speakPercentForSpeech(raw)}`)
  s = s.replace(/[−\-–]\s*(\d+(?:[.,]\d+)?)\s*%/g, (_, raw) => `минус ${speakPercentForSpeech(raw)}`)
  return s
}

/** @param {string} text */
export function prepareRangesForSpeech(text) {
  let s = String(text ?? '')

  s = s.replace(
    /от\s+(\d[\d\s]*)\s+до\s+(\d[\d\s]*)\s+рубл(?:ь|я|ей)/gi,
    (_, a, b) => {
      const na = parseInt(String(a).replace(/\s/g, ''), 10)
      const nb = parseInt(String(b).replace(/\s/g, ''), 10)
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return `от ${a} до ${b} рублей`
      return `от ${speakRubAmountForSpeech(na)} до ${speakRubAmountForSpeech(nb)}`
    },
  )

  s = s.replace(/от\s+(\d+(?:[.,]\d+)?)\s*%\s+до\s+(\d+(?:[.,]\d+)?)\s*%/gi, (_, a, b) => {
    return `от ${speakPercentForSpeech(a)} до ${speakPercentForSpeech(b)}`
  })

  s = s.replace(/от\s+(\d[\d\s]*)\s+до\s+(\d[\d\s]*)/gi, (_, a, b) => {
    const na = parseInt(String(a).replace(/\s/g, ''), 10)
    const nb = parseInt(String(b).replace(/\s/g, ''), 10)
    const left = Number.isFinite(na) ? integerToRussianWords(na) : a
    const right = Number.isFinite(nb) ? integerToRussianWords(nb) : b
    return `от ${left} до ${right}`
  })

  return s
}

/** @param {string} text */
export function prepareOrdinalsForSpeech(text) {
  let s = String(text ?? '')

  s = s.replace(/(\d{1,2})-?(?:й|я|е|го)\s+(день|уровень|этап|шаг)/gi, (_, raw, noun) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1 || n > 31) return `${raw}-й ${noun}`
    const mod10 = n % 10
    const mod100 = n % 100
    let ord = RU_ORD_ONES_NOM[mod10]
    if (mod100 >= 11 && mod100 <= 14) ord = `${integerToRussianWords(n)}-й`
    else if (mod10 === 0 || mod10 >= 5) ord = `${integerToRussianWords(n)}-й`
    return `${ord} ${noun}`
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
    [/(\d+)\s+неактивн(?:ых|ого|ый)\s+клиент(?:ов|а)?/gi, 'клиент', 'клиента', 'клиентов'],
    [/(\d+)\s+активн(?:ых|ого|ый)\s+клиент(?:ов|а)?/gi, 'клиент', 'клиента', 'клиентов'],
    [/(\d+)\s+клиент(?:ов|а|ы)?/gi, 'клиент', 'клиента', 'клиентов'],
    [/(\d+)\s+отчёт(?:ов|а)?/gi, 'отчёт', 'отчёта', 'отчётов'],
    [/(\d+)\s+трениров(?:ок|ки|ка)?/gi, 'тренировка', 'тренировки', 'тренировок'],
    [/(\d+)\s+дн(?:ей|я|ь)/gi, 'день', 'дня', 'дней'],
    [/(\d+)\s+абонемент(?:ов|а)?/gi, 'абонемент', 'абонемента', 'абонементов'],
    [/(\d+)\s+раз(?:а)?/gi, 'раз', 'раза', 'раз'],
    [/(\d+)\s+пункт(?:ов|а)?/gi, 'пункт', 'пункта', 'пунктов'],
    [/(\d+)\s+тренер(?:ов|а)?/gi, 'тренер', 'тренера', 'тренеров'],
  ]

  for (const [re, one, few, many] of countPatterns) {
    s = s.replace(re, (_, raw) => speakCountForSpeech(raw, one, few, many))
  }

  s = s.replace(/уровень\s+(\d{1,2})/gi, (_, raw) => {
    const n = parseInt(raw, 10)
    return `уровень ${integerToRussianWords(n) || raw}`
  })

  return s
}

/** Оставшиеся короткие числа (1–4 цифры) — прописью. */
export function prepareRemainingNumbersForSpeech(text) {
  return String(text ?? '').replace(/(?<=[\s,(])(\d{1,4})(?=[\s),.!?;:]|$)/g, (match) => {
    const n = parseInt(match, 10)
    return Number.isFinite(n) ? integerToRussianWords(n) || match : match
  })
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
    .replace(/\s+Можно уточнить параметры\./gi, ', можно уточнить параметры.')
    .replace(/\s+в темпе\./gi, ', в темпе.')
    .replace(/\s+в норме\./gi, ', в норме.')
    .replace(/\s+по залам:/gi, ', по залам,')
    .replace(/\s+по направлениям:/gi, ', по направлениям,')
    .replace(/\s+из них\s+/gi, ', из них ')
    .replace(/\s+а именно\s+/gi, ', а именно ')
    .replace(/\s+то есть\s+/gi, ', то есть ')
    .replace(/\s+при этом\s+/gi, ', при этом ')
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    .replace(/\.\.\./g, ', ')
    .replace(/…/g, ', ')
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
  s = prepareDeltasForSpeech(s)
  s = prepareRangesForSpeech(s)
  s = prepareOrdinalsForSpeech(s)
  s = prepareCountsForSpeech(s)
  s = prepareNumbersForSpeech(s)
  s = prepareRemainingNumbersForSpeech(s)
  s = prepareNumbersForSpeech(s)
  s = prepareProsodyForSpeech(s)
  return s
}
