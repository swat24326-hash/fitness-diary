/**
 * Режимы глубины ответа ИСКРЫ (Эпик I — умная ИСКРА для app_admin).
 * Чистые функции — scripts/verify-iskra-response-mode.mjs
 */

/** @typedef {'brief'|'standard'|'deep'} IskraResponseMode */

export const ISKRA_RESPONSE_MODES = /** @type {const} */ (['brief', 'standard', 'deep'])

const DEEP_QUESTION_RE =
  /разбер|подробн|почему|план действ|пошаг|что делать|как дожать|объясни|анализ|причин|стратег|рекоменд|что не так|где теряем|кого трогать/i

/** @param {string} [raw] @returns {IskraResponseMode | ''} */
export function normalizeIskraResponseMode(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (v === 'deep' || v === 'detailed' || v === 'подробно') return 'deep'
  if (v === 'brief' || v === 'short' || v === 'кратко') return 'brief'
  if (v === 'standard' || v === 'normal' || v === 'стандарт') return 'standard'
  return ''
}

/** @param {string} [message] */
export function isDeepAnalysisQuestion(message) {
  return DEEP_QUESTION_RE.test(String(message ?? ''))
}

/**
 * @param {{
 *   advisorRoleId?: string,
 *   userMessage?: string,
 *   explicitMode?: string,
 *   userPreference?: string,
 *   chipId?: string | null,
 *   instantPath?: boolean,
 *   comparePrevious?: boolean,
 * }} [opts]
 * @returns {IskraResponseMode}
 */
export function resolveIskraResponseMode(opts = {}) {
  const advisorRoleId = String(opts.advisorRoleId ?? 'app_admin').trim()
  if (opts.instantPath === true || opts.chipId) return 'brief'

  const explicit = normalizeIskraResponseMode(opts.explicitMode)
  if (explicit) return explicit

  if (advisorRoleId !== 'app_admin') return 'brief'

  const pref = normalizeIskraResponseMode(opts.userPreference)
  if (pref === 'deep') return 'deep'
  if (pref === 'brief') return 'brief'

  const msg = String(opts.userMessage ?? '')
  if (isDeepAnalysisQuestion(msg)) return 'deep'
  if (opts.comparePrevious === true) return 'standard'

  return pref || 'standard'
}

/** @param {IskraResponseMode} mode */
export function resolveAdviceCardLimit(mode) {
  if (mode === 'deep') return 8
  if (mode === 'standard') return 5
  return 3
}

/** @param {IskraResponseMode} mode */
export function resolveChatHistoryTurns(mode) {
  if (mode === 'deep') return 12
  if (mode === 'standard') return 10
  return 6
}

/** @param {IskraResponseMode} mode */
export function iskraAdminRichContext(mode) {
  return mode === 'standard' || mode === 'deep'
}

/**
 * @param {IskraResponseMode} mode
 * @param {boolean} [retry]
 */
export function resolveGeminiGenerationConfig(mode, retry = false) {
  if (mode === 'deep') {
    return retry
      ? { temperature: 0.5, maxOutputTokens: 2048 }
      : { temperature: 0.55, maxOutputTokens: 1536 }
  }
  if (mode === 'standard') {
    return retry
      ? { temperature: 0.55, maxOutputTokens: 1024 }
      : { temperature: 0.6, maxOutputTokens: 768 }
  }
  return retry
    ? { temperature: 0.55, maxOutputTokens: 512 }
    : { temperature: 0.6, maxOutputTokens: 384 }
}

export const GEMINI_RESPONSE_BRIEF_RULE =
  'Ответ: 2–3 предложения, до 50 слов. «Кто ты» — реклама помощи управляющему, БЕЗ цифр плана. Про план — только цифры из JSON. Формат: ИСКРА, [клуб], [месяц]. [факт]. На связи. Без markdown.'

/** @param {IskraResponseMode} mode */
export function buildIskraResponseFormatRule(mode) {
  if (mode === 'deep') {
    return [
      'ФОРМАТ ОТВЕТА (развёрнутый анализ для админа):',
      'Структура: факты из данных → вывод → 1–3 конкретных шага → риск или контрольная точка.',
      'Длина: столько, сколько нужно для ясности (абзацы, нумерованные шаги). Markdown для списков допустим.',
      'Без самопрезентации и воды. «На связи» в конце — не обязательно.',
      'Цифры только из JSON, advisor_advice и insights; оценки модели — с «Оценка ИСКРЫ».',
    ].join('\n')
  }
  if (mode === 'standard') {
    return [
      'ФОРМАТ ОТВЕТА (стандартный чат админа):',
      '1–2 абзаца или до 5 пунктов: факт → вывод → шаг при необходимости.',
      'Без самопрезентации. Markdown для списков допустим.',
      'Цифры только из данных приложения.',
    ].join('\n')
  }
  return GEMINI_RESPONSE_BRIEF_RULE
}

/** Edge Gemini не поддерживает увеличенный лимит токенов — только Vercel API. */
export function shouldSkipGeminiEdge(mode) {
  return mode !== 'brief'
}

/**
 * Фрагмент для TTS: не читать простыню в режиме deep.
 * @param {string} text
 * @param {IskraResponseMode} [mode]
 */
export function extractIskraSpeechSnippet(text, mode = 'standard') {
  const raw = String(text ?? '').trim()
  if (!raw) return ''
  if (mode === 'brief') return raw

  const para = (raw.split(/\n\n+/)[0] || raw).trim()
  const sentences = para.match(/[^.!?…]+[.!?…]+/g)
  let snippet = sentences?.length ? sentences.slice(0, 2).join(' ').trim() : para
  const words = snippet.split(/\s+/).filter(Boolean)
  if (words.length > 55) {
    snippet = `${words.slice(0, 50).join(' ')}…`
  }
  return snippet
}

/** @param {IskraResponseMode} mode @param {string} [finishReason] */
export function isGeminiReplyIncompleteForMode(text, finishReason, mode = 'brief') {
  const t = String(text ?? '').trim()
  if (!t) return true
  if (finishReason === 'MAX_TOKENS') return true
  const minLen = mode === 'deep' ? 80 : mode === 'standard' ? 50 : 35
  if (t.length < minLen && mode === 'brief') return true
  if (t.length < 25) return true
  if (/[а-яa-z0-9)]$/i.test(t) && !/[.!?…]$/.test(t)) return true
  return false
}
