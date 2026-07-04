/** Промпт и payload для Gemini (Василий / Василиса). */

import { trimChatHistory } from './geminiAnalyticsSnapshot.js'
import { buildGeminiDataSourceRules, buildGeminiLexiconRule } from './geminiAnalyticsDomain.js'

/** Сначала lite — дешевле и стабильнее на free tier Google AI Studio (2026). */
export const GEMINI_ANALYTICS_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
]

export const GEMINI_ANALYTICS_MODEL = GEMINI_ANALYTICS_MODELS[0]

/** Лимит длины ответа для чата и озвучки. */
export const GEMINI_GENERATION_CONFIG = {
  temperature: 0.72,
  maxOutputTokens: 320,
}

export const GEMINI_RESPONSE_BRIEF_RULE =
  'Ответ: 2–4 коротких предложения, до 70 слов — как живой голосовой комментарий. Без markdown, списков и воды. Одна главная цифра и чёткий вывод.'

/** Явный флаг или формулировка вопроса про прошлый месяц / динамику. */
export function shouldComparePreviousMonth(userMessage) {
  const s = String(userMessage ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (!s.trim()) return false
  return (
    /прошл(ый|ом|ая|ую|ие|ей)\s*месяц/.test(s) ||
    /с\s+прошл/.test(s) ||
    /к\s+прошл/.test(s) ||
    /динамик/.test(s) ||
    /(лучше|хуже|рост|падени|просел|поднял)/.test(s) && /месяц|период|было/.test(s) ||
    /месяц\s+к\s+месяц/.test(s) ||
    /mom|month.over.month/.test(s)
  )
}

export function resolveGeminiComparePrevious({ userMessage, comparePrevious = false }) {
  if (comparePrevious === true) return true
  return shouldComparePreviousMonth(userMessage)
}

export function isGeminiQuotaError(message) {
  const s = String(message ?? '').toLowerCase()
  return (
    s.includes('quota') ||
    s.includes('rate limit') ||
    s.includes('rate-limit') ||
    s.includes('resource_exhausted') ||
    s.includes('429')
  )
}

export function isGeminiOverloadError(message) {
  const s = String(message ?? '').toLowerCase()
  return (
    s.includes('high demand') ||
    s.includes('overloaded') ||
    s.includes('try again later') ||
    s.includes('temporarily unavailable') ||
    s.includes('service unavailable') ||
    s.includes('503')
  )
}

/** Перебор следующей модели: квота, перегруз, модель снята или неверное имя. */
export function isGeminiRetryableError(message) {
  const s = String(message ?? '').toLowerCase()
  if (isGeminiQuotaError(s)) return true
  if (isGeminiOverloadError(s)) return true
  return (
    s.includes('not found') ||
    s.includes('not supported') ||
    s.includes('is not found for api version') ||
    s.includes('has been shut down') ||
    s.includes('deprecated')
  )
}

/** Короткое сообщение для UI вместо простыни от Google API. */
export function formatGeminiUserError(message) {
  const raw = String(message ?? '').trim()
  if (!raw) return 'Не удалось получить ответ от Gemini'
  if (isGeminiOverloadError(raw)) {
    return 'Gemini перегружен — подождите 10–20 сек и спросите снова. Ответ уже пробовали получить через другую модель.'
  }
  if (isGeminiQuotaError(raw)) {
    const retry = raw.match(/retry in ([\d.]+)s/i)
    const waitSec = retry ? Math.ceil(Number(retry[1])) : 0
    const wait = waitSec > 0 ? ` Подождите ~${waitSec} сек.` : ' Подождите минуту.'
    return (
      `Лимит бесплатного Gemini исчерпан.${wait} ` +
      'Если повторяется — новый ключ на aistudio.google.com или биллинг в Google AI.'
    )
  }
  if (raw.length > 220) return `${raw.slice(0, 217)}…`
  return raw
}

/**
 * @param {'male'|'female'|string} gender
 * @returns {{ name: string, persona: string }}
 */
export function buildPersona(gender) {
  if (gender === 'female') {
    return {
      name: 'Василиса',
      persona: 'авторитетная старшая сестра команды',
    }
  }
  return {
    name: 'Василий',
    persona: 'близкий кент и старший брат команды',
  }
}

/**
 * @param {'male'|'female'|string} gender
 * @param {string} clubName
 */
export function buildSystemPrompt(gender, clubName) {
  const { name, persona } = buildPersona(gender)
  const club = String(clubName ?? '').trim() || 'филиал'
  return [
    `Ты — ${name}, внутренний аналитик команды FIT-CITY. Твой характер: ${persona}.`,
    buildGeminiLexiconRule(),
    `Хвали за сильные цифры, жёстко но по делу критикуй слабые — без мата и личных оскорблений.`,
    `Анализируй ТОЛЬКО филиал «${club}» — называй его по имени.`,
    buildGeminiDataSourceRules(),
    `Опирайся ТОЛЬКО на JSON в сообщении. Не выдумывай цифры. Учитывай data_sources.analysis_hints.`,
    `Если отчётов мало (низкий report_coverage_pct) — скажи, что база не забита, выводы осторожные.`,
    GEMINI_RESPONSE_BRIEF_RULE,
  ].join('\n')
}

/**
 * @param {object} opts
 * @returns {{ systemInstruction: object, contents: object[] }}
 */
export function buildGeminiGeneratePayload(opts) {
  const gender = opts.gender === 'female' ? 'female' : 'male'
  const clubName = String(opts.clubName ?? opts.snapshot?.club_name ?? '').trim()
  const history = trimChatHistory(opts.messages, 10)
  const userMessage = String(opts.userMessage ?? '').trim()
  const snapshot = opts.snapshot ?? {}
  const previous = opts.previousSnapshot ?? null

  const dataBlock = {
    current_period: snapshot,
    previous_period: previous,
  }

  const parts = []
  if (history.length === 0) {
    parts.push({
      text: `Данные для анализа (JSON):\n${JSON.stringify(dataBlock, null, 2)}\n\nВопрос: ${userMessage}`,
    })
  } else {
    for (const msg of history) {
      parts.push({
        text: msg.role === 'assistant' ? `[${buildPersona(gender).name}]: ${msg.content}` : `[Руководитель]: ${msg.content}`,
      })
    }
    parts.push({
      text: `Актуальные данные (JSON):\n${JSON.stringify(dataBlock, null, 2)}\n\nНовый вопрос: ${userMessage}`,
    })
  }

  return {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(gender, clubName) }],
    },
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
  }
}

/** @param {object} apiResponse */
export function extractGeminiText(apiResponse) {
  const parts = apiResponse?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => String(p?.text ?? '')).join('').trim()
}
