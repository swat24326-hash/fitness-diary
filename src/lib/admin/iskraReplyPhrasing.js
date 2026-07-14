/** Фразы для ответов ИСКРЫ — лаконично и без логических дыр на слух. */

import { formatRub } from './salesReportCore.js'

function formatPctNumber(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

/** @param {number} pct */
export function formatPctPlain(pct) {
  return formatPctNumber(pct)
}

/** @param {number} pct */
export function phrasePlanProgress(pct) {
  return `план ${formatPctNumber(pct)}%`
}

/**
 * Короткая строка плана для чата: %, факт и цель.
 * @param {number} pct
 * @param {number} profitRub
 * @param {number} planRub
 */
export function phrasePlanSnapshotLine(pct, profitRub, planRub) {
  return `план ${formatPctNumber(pct)}% — ${formatRub(profitRub)} из ${formatRubCompact(planRub)}`
}

/**
 * Компактная сумма для экрана (млн / тыс).
 * @param {number} amount
 */
export function formatRubCompact(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.round(n))
  if (abs >= 1_000_000) {
    const m = Math.round((abs / 1_000_000) * 10) / 10
    const str = Number.isInteger(m) ? String(m) : String(m).replace('.', ',')
    return `${str} млн ₽`
  }
  if (abs >= 100_000 && abs % 1000 === 0) {
    return `${Math.round(abs / 1000)} тыс ₽`
  }
  return formatRub(amount)
}

function pluralRu(n, one, few, many) {
  const abs = Math.abs(Math.trunc(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

const RU_ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const RU_ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const RU_TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
]
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
const RU_HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
]
const RU_DEC_ONES = [
  'ноль',
  'одна',
  'две',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]

/**
 * Целое число прописью — TTS иначе читает «221 рубль» с неверным склонением.
 * @param {number} n
 * @param {{ feminine?: boolean }} [options]
 */
export function integerToRussianWords(n, options = {}) {
  const feminine = options.feminine === true
  const num = Math.abs(Math.trunc(Number(n))) % 1000
  if (!Number.isFinite(num) || num === 0) return ''

  const ones = feminine ? RU_ONES_F : RU_ONES_M
  const parts = []
  const hundreds = Math.floor(num / 100)
  const tens = Math.floor((num % 100) / 10)
  const units = num % 10

  if (hundreds > 0) parts.push(RU_HUNDREDS[hundreds])
  if (tens > 1) parts.push(RU_TENS[tens])
  if (tens === 1) parts.push(RU_TEENS[units])
  else if (units > 0) parts.push(ones[units])

  return parts.join(' ')
}

/** @param {number} amount */
export function speakRubAmountForSpeech(amount) {
  const n = Math.round(Math.abs(Number(amount)))
  if (!Number.isFinite(n) || n === 0) return 'ноль рублей'

  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const units = n % 1000
  const parts = []

  if (millions > 0) {
    const words = integerToRussianWords(millions)
    if (words) {
      parts.push(`${words} ${pluralRu(millions, 'миллион', 'миллиона', 'миллионов')}`)
    }
  }
  if (thousands > 0) {
    const words = integerToRussianWords(thousands, { feminine: true })
    if (words) {
      parts.push(`${words} ${pluralRu(thousands, 'тысяча', 'тысячи', 'тысяч')}`)
    }
  }
  if (units > 0) {
    const words = integerToRussianWords(units)
    if (words) parts.push(words)
  }

  if (!parts.length) return 'ноль рублей'
  return `${parts.join(' ')} ${pluralRu(n, 'рубль', 'рубля', 'рублей')}`
}

/** @param {string|number} raw */
export function speakPercentForSpeech(raw) {
  const n = parseFloat(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return 'ноль процентов'
  const int = Math.floor(Math.abs(n))
  const dec = Math.round((Math.abs(n) - int) * 10)
  const intWords = integerToRussianWords(int) || 'ноль'
  if (dec === 0) {
    return `${intWords} ${pluralRu(int, 'процент', 'процента', 'процентов')}`
  }
  return `${intWords} целых ${RU_DEC_ONES[dec]} десятых процента`
}

function speakMillionRubles(raw) {
  const n = parseFloat(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return 'один миллион рублей'
  const int = Math.floor(n)
  const dec = Math.round((n - int) * 10)
  const intWords = integerToRussianWords(int) || 'ноль'
  if (dec === 0) {
    return `${intWords} ${pluralRu(int, 'миллион', 'миллиона', 'миллионов')} рублей`
  }
  return `${intWords} целых ${RU_DEC_ONES[dec]} десятых миллиона рублей`
}

/**
 * Суммы и проценты в форме, удобной для TTS.
 * @param {string} text
 */
export function prepareNumbersForSpeech(text) {
  let s = String(text ?? '')

  s = s.replace(/(\d+(?:[.,]\d+)?)\s*млн\s*₽/gi, (_, raw) => speakMillionRubles(raw))
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*млн(?=[\s,.!?;:]|$)/gi, (_, raw) => speakMillionRubles(raw))
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*тыс\s*₽/gi, (_, raw) => {
    const n = Math.round(parseFloat(String(raw).replace(',', '.')) * 1000)
    return speakRubAmountForSpeech(n)
  })
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*тыс(?=[\s,.!?;:]|$)/gi, (_, raw) => {
    const n = Math.round(parseFloat(String(raw).replace(',', '.')) * 1000)
    return speakRubAmountForSpeech(n)
  })
  s = s.replace(/(\d[\d\s]*)\s*₽/g, (_, raw) => {
    const n = parseInt(String(raw).replace(/\s/g, ''), 10)
    return Number.isFinite(n) ? speakRubAmountForSpeech(n) : `${String(raw).trim()} рублей`
  })
  s = s.replace(/(\d[\d\s]*)\s+рубл(?:ь|я|ей)(?=[\s,.!?;:]|$)/gi, (_, raw) => {
    const n = parseInt(String(raw).replace(/\s/g, ''), 10)
    return Number.isFinite(n) ? speakRubAmountForSpeech(n) : String(raw).trim()
  })
  s = s.replace(/(\d+(?:[.,]\d+)?)\s+процент(?:ов|а)?(?=[\s,.!?;:]|$)/gi, (_, raw) =>
    speakPercentForSpeech(raw))
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, raw) => speakPercentForSpeech(raw))
  s = s.replace(
    /(\d+)\s+целых\s+(\d)\s+десятых\s+процент(а|ов)/gi,
    (_, intPart, decPart) => {
      const intWords = integerToRussianWords(parseInt(intPart, 10)) || intPart
      const dec = parseInt(decPart, 10)
      const decWord = RU_DEC_ONES[dec] ?? decPart
      return `${intWords} целых ${decWord} десятых процента`
    },
  )

  return s
}

/** @param {number} pct */
export function phrasePlanBenchmark(pct) {
  return `норма к дате ${formatPctNumber(pct)}%`
}

/** @param {number} pct */
export function phrasePlanFact(pct) {
  return `выполнено ${formatPctNumber(pct)}%`
}

/** @param {number} pct */
export function phraseDirectionProgress(label, pct) {
  const name = String(label ?? '').trim() || 'направление'
  return `${name} на ${formatPctNumber(pct)}%`
}

/** Расшифровка аббревиатур FIT-CITY только для озвучки (на экране остаются ПЗ, ТЗ, АЗ…). */
export const ISKRA_SPEECH_ABBREVIATIONS = {
  ПНК: 'потенциальные новые клиенты',
  ПЗ: 'персональный зал',
  ТЗ: 'тренажёрный зал',
  АЗ: 'аэробный зал',
  НК: 'новые клиенты',
  ДК: 'действующие клиенты',
  УК: 'уходящие клиенты',
}

const WRONG_DK_UK_EXPANSION_RE =
  /длительн(?:ый|ого|ому|ым|ом|ую|ая|ые|ых|ое|ая|ие|их)\s+к(?:уб|луб(?:а|у|е|ом|ы|ов)?)/gi
const WRONG_UK_EXPANSION_RE =
  /утренн(?:ий|его|ему|им|ем|юю|яя|ие|их|ее|ее)\s+к(?:уб|луб(?:а|у|е|ом|ы|ов)?)/gi

/** Исправляет типичные галлюцинации Gemini про ДК/УК. */
export function fixIskraWrongAbbreviationExpansions(text) {
  return String(text ?? '')
    .replace(/\bДК\b\s*\(\s*длительн[^)]*\)/gi, 'ДК')
    .replace(/\bУК\b\s*\(\s*утренн[^)]*\)/gi, 'УК')
    .replace(WRONG_DK_UK_EXPANSION_RE, 'действующие клиенты')
    .replace(WRONG_UK_EXPANSION_RE, 'уходящие клиенты')
}

function expandHyphenatedAbbreviation(match, left, right) {
  const leftFull = ISKRA_SPEECH_ABBREVIATIONS[left.toUpperCase()] ?? left
  const rightFull = ISKRA_SPEECH_ABBREVIATIONS[right.toUpperCase()] ?? right
  return `${leftFull}, ${rightFull}`
}

/**
 * Заменяет аббревиатуры полными названиями для TTS.
 * @param {string} text
 */
export function expandAbbreviationsForSpeech(text) {
  let s = fixIskraWrongAbbreviationExpansions(text)

  s = s
    .replace(/FIT[\s-]*CITY/gi, 'фит сити')
    .replace(/ПЗ\s*\/\s*ТЗ\s*\/\s*АЗ/gi, 'персональный зал, тренажёрный зал, аэробный зал')
    .replace(/НК\s*\/\s*ДК\s*\/\s*УК/gi, 'новые клиенты, действующие клиенты, уходящие клиенты')
    .replace(/ПЗ,\s*ТЗ,\s*АЗ/gi, 'персональный зал, тренажёрный зал, аэробный зал')
    .replace(/ПЗ,\s*ТЗ\s+и\s+АЗ/gi, 'персональный зал, тренажёрный зал и аэробный зал')
    .replace(/НК,\s*ДК,\s*УК/gi, 'новые клиенты, действующие клиенты, уходящие клиенты')
    .replace(/([ПТА]З|НК|ДК|УК)-([ПТА]З|НК|ДК|УК)/gi, expandHyphenatedAbbreviation)

  const ordered = [
    ['ПНК', ISKRA_SPEECH_ABBREVIATIONS.ПНК],
    ['ПЗ', ISKRA_SPEECH_ABBREVIATIONS.ПЗ],
    ['ТЗ', ISKRA_SPEECH_ABBREVIATIONS.ТЗ],
    ['АЗ', ISKRA_SPEECH_ABBREVIATIONS.АЗ],
    ['НК', ISKRA_SPEECH_ABBREVIATIONS.НК],
    ['ДК', ISKRA_SPEECH_ABBREVIATIONS.ДК],
    ['УК', ISKRA_SPEECH_ABBREVIATIONS.УК],
  ]

  for (const [abbr, full] of ordered) {
    s = s.replace(new RegExp(`${abbr}\\s+на\\s`, 'gi'), `${full} на `)
    s = s.replace(new RegExp(`${abbr}\\s+(\\d)`, 'gi'), `${full} $1`)
    s = s.replace(new RegExp(`(^|[\\s,.])${abbr}(?=[\\s,.]|$)`, 'gi'), `$1${full}`)
  }

  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Дополнительная правка перед TTS (и для ответов Gemini).
 * @param {string} text
 */
export function polishIskraReplyText(text) {
  let s = fixIskraWrongAbbreviationExpansions(text)

  s = s
    .replace(/план\s+выполнен\s+на\s+/gi, 'план ')
    .replace(/ориентир(?:\s+плана)?(?:\s+к\s+дате)?\s*~?\s*(\d+(?:[.,]\d+)?)\s*%/gi, 'норма $1%')
    .replace(/ориентир(?:\s+плана)?(?:\s+к\s+дате)?\s*~?\s*(\d+(?:[.,]\d+)?)\s+процентов/gi, 'норма к дате $1%')
    .replace(/факт\s+(\d+(?:[.,]\d+)?)\s*(?:%|процентов)/gi, 'выполнено $1%')
    .replace(/покрытие\s+(\d+(?:[.,]\d+)?)\s*(?:%|процентов)/gi, 'отчётность $1%')
    .replace(/(\d+)\s+из\s+(\d+)\s+\((\d+(?:[.,]\d+)?)\s*(?:%|процентов)\)/gi, '$1 отчётов из $2, это $3%')
    .replace(/Данные приняты:\s*/gi, '')
    .replace(/ИСКРА:\s*/gi, 'ИСКРА. ')
    .replace(/;\s+/g, ', ')
    .replace(/\s+—\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
}
