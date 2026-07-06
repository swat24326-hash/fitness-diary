/** Промпт и payload для ЭВС «ИСКРА» (Gemini backend). */

import { trimChatHistory, compactSnapshotForPrompt } from './geminiAnalyticsSnapshot.js'
import { buildIskraSystemPrompt, buildPersona } from './geminiIskraCore.js'

export { buildPersona }

/** Сначала lite — дешевле и стабильнее на free tier Google AI Studio (2026). */
export const GEMINI_ANALYTICS_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
]

export const GEMINI_ANALYTICS_MODEL = GEMINI_ANALYTICS_MODELS[0]

/** Лимит длины ответа для чата и озвучки. */
export const GEMINI_GENERATION_CONFIG = {
  temperature: 0.65,
  maxOutputTokens: 512,
}

export const GEMINI_GENERATION_CONFIG_RETRY = {
  temperature: 0.6,
  maxOutputTokens: 768,
}

export const GEMINI_RESPONSE_BRIEF_RULE =
  'Ответ: 2–5 коротких предложений, до 90 слов. Язык бизнеса, без названий полей JSON и без «контуров». Без markdown и списков. Закончи полным предложением с точкой.'

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
 * @param {'male'|'female'|string} _gender
 * @param {string} clubName
 */
export function buildSystemPrompt(_gender, clubName, opts = {}) {
  return buildIskraSystemPrompt(clubName, opts)
}

/** Компактный блок данных для промпта (меньше шума для модели). */
export function buildGeminiPromptDataBlock(snapshot, previousSnapshot = null, opts = {}) {
  const selectedTrainerId = opts.selectedTrainerId ?? snapshot?.trainer_contour?.selected_trainer_id ?? null
  const current = compactSnapshotForPrompt(snapshot, selectedTrainerId)
  const block = {
    analysis_period: current?.period?.label ?? '',
    sales_contour: current?.sales_contour ?? null,
    trainer_contour: current?.trainer_contour ?? null,
    finance: current?.finance ?? null,
    trainings: current?.trainings ?? null,
    insights: current?.insights ?? null,
    data_sources: current?.data_sources ?? null,
    current_period: current?.period ?? null,
  }
  if (previousSnapshot) {
    const prev = compactSnapshotForPrompt(previousSnapshot, selectedTrainerId)
    block.previous_period = {
      period: prev?.period ?? null,
      sales_contour: prev?.sales_contour ?? null,
      trainer_contour: prev?.trainer_contour ?? null,
      insights: prev?.insights ?? null,
    }
  }
  return block
}

/** @param {string} text @param {string} [finishReason] */
export function isGeminiReplyIncomplete(text, finishReason) {
  const t = String(text ?? '').trim()
  if (!t) return true
  if (finishReason === 'MAX_TOKENS') return true
  if (t.length < 35) return true
  if (/[а-яa-z0-9)]$/i.test(t) && !/[.!?…]$/.test(t)) return true
  return false
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
  const dataBlock = buildGeminiPromptDataBlock(opts.snapshot, opts.previousSnapshot, {
    selectedTrainerId: opts.selectedTrainerId,
  })
  const periodLabel = dataBlock.analysis_period || 'период не задан'
  const promptOpts = { promptAppend: opts.promptAppend }

  const parts = []
  if (history.length === 0) {
    parts.push({
      text: `Период анализа (только он): ${periodLabel}\n\nДанные (JSON):\n${JSON.stringify(dataBlock)}\n\nВопрос: ${userMessage}`,
    })
  } else {
    for (const msg of history) {
      parts.push({
        text: msg.role === 'assistant' ? `[${buildPersona(gender).name}]: ${msg.content}` : `[Руководитель]: ${msg.content}`,
      })
    }
    parts.push({
      text: `Период анализа (только он): ${periodLabel}\n\nАктуальные данные (JSON):\n${JSON.stringify(dataBlock)}\n\nНовый вопрос: ${userMessage}`,
    })
  }

  return {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(gender, clubName, promptOpts) }],
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

/** @param {object} apiResponse */
export function extractGeminiFinishReason(apiResponse) {
  return String(apiResponse?.candidates?.[0]?.finishReason ?? '').trim()
}
