/** Промпт и payload для Gemini (Василий / Василиса). */

import { trimChatHistory } from './geminiAnalyticsSnapshot.js'

export const GEMINI_ANALYTICS_MODEL = 'gemini-2.0-flash'

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
    `Говоришь по-братски, живо, с сленгом (красава, косяк, поднажать, на связи).`,
    `Хвали за сильные цифры, жёстко критикуй слабые места — без мата и личных оскорблений.`,
    `Анализируй ТОЛЬКО филиал «${club}» — называй его по имени в ответе.`,
    `Опирайся ТОЛЬКО на JSON-данные в сообщении пользователя. Не выдумывай цифры.`,
    `Если данных мало или отчёты пустые — скажи прямо, что база не забита.`,
    `Ответ: один абзац на русском, 4–8 предложений, без markdown и списков.`,
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
