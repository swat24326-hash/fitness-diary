/** Фразы для ответов ИСКРЫ — лаконично и без логических дыр на слух. */

function formatPctNumber(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

/** @param {number} pct */
export function phrasePlanProgress(pct) {
  return `план выполнен на ${formatPctNumber(pct)}%`
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
  УК: 'ушедшие клиенты',
}

/**
 * Заменяет аббревиатуры полными названиями для TTS.
 * @param {string} text
 */
export function expandAbbreviationsForSpeech(text) {
  let s = String(text ?? '')

  s = s
    .replace(/FIT[\s-]*CITY/gi, 'фит сити')
    .replace(/ПЗ\s*\/\s*ТЗ\s*\/\s*АЗ/gi, 'персональный зал, тренажёрный зал, аэробный зал')
    .replace(/НК\s*\/\s*ДК\s*\/\s*УК/gi, 'новые клиенты, действующие клиенты, ушедшие клиенты')
    .replace(/ПЗ,\s*ТЗ,\s*АЗ/gi, 'персональный зал, тренажёрный зал, аэробный зал')
    .replace(/ПЗ,\s*ТЗ\s+и\s+АЗ/gi, 'персональный зал, тренажёрный зал и аэробный зал')
    .replace(/НК,\s*ДК,\s*УК/gi, 'новые клиенты, действующие клиенты, ушедшие клиенты')

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
  let s = String(text ?? '')

  s = s
    .replace(/план\s+(\d+(?:[.,]\d+)?)\s*%/gi, 'план выполнен на $1%')
    .replace(/план\s+(\d+(?:[.,]\d+)?)\s+процентов/gi, 'план выполнен на $1 процентов')
    .replace(/ориентир(?:\s+плана)?(?:\s+к\s+дате)?\s*~?\s*(\d+(?:[.,]\d+)?)\s*%/gi, 'норма к дате $1%')
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
