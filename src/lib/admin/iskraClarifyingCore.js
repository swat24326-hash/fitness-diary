/**
 * ИСКРА — редкие уточняющие вопросы владельцу (слой B самообучения).
 * Чистые функции — verify-iskra-learning.mjs.
 */

import { detectOwnerFeedbackFromMessage } from './iskraOwnerFeedbackDetectCore.js'

/** Маркер в ответе модели — для детекта «уже спросила». */
export const ISKRA_CLARIFYING_PREFIX = 'Уточню:'

export const ISKRA_CLARIFYING_QUESTIONS = Object.freeze({
  course_stop: 'важнее сейчас план продаж, команда или другой фокус?',
  style: 'отвечать короче или с шагами и деталями?',
  periodic: 'фокус недели тот же — или сменился приоритет?',
  after_negative: 'что поправить в следующих ответах: тон, тема или глубина?',
})

/**
 * @param {Array<{ role?: string, content?: string }> | null | undefined} messages
 */
export function recentAssistantAskedClarifying(messages, lookback = 4) {
  const list = Array.isArray(messages) ? messages : []
  const slice = list.slice(-Math.max(1, lookback))
  return slice.some(
    (m) =>
      m?.role === 'assistant' &&
      String(m.content ?? '').includes(ISKRA_CLARIFYING_PREFIX),
  )
}

/**
 * @param {{ last_event_at?: string | null }} signal
 * @param {number} [hours]
 */
function isRecentLearningSignal(signal, hours = 72) {
  const raw = signal?.last_event_at
  if (!raw) return true
  const t = Date.parse(String(raw))
  if (!Number.isFinite(t)) return true
  return Date.now() - t < hours * 3600 * 1000
}

/**
 * @param {{
 *   jarvis?: boolean,
 *   learningBundle?: { signals?: Array<{ signal_key?: string, negative_count?: number, positive_count?: number, score?: number, playbook_note?: string, last_event_at?: string | null }> } | null,
 *   messages?: Array<{ role?: string, content?: string }>,
 *   userMessage?: string,
 * }} opts
 * @returns {{ ask: true, reason: string, question: string } | { ask: false, reason: string }}
 */
export function resolveIskraClarifyingAsk(opts = {}) {
  if (!opts.jarvis) return { ask: false, reason: 'not_jarvis' }

  const userMessage = String(opts.userMessage ?? '').trim()
  if (detectOwnerFeedbackFromMessage(userMessage).length) {
    return { ask: false, reason: 'user_already_correcting' }
  }

  if (recentAssistantAskedClarifying(opts.messages)) {
    return { ask: false, reason: 'recently_asked' }
  }

  const signals = opts.learningBundle?.signals ?? []
  const byKey = (key) => signals.find((s) => s.signal_key === key)

  const course = byKey('owner:course')
  if (
    course &&
    isRecentLearningSignal(course) &&
    (String(course.playbook_note ?? '').trim() || (Number(course.negative_count) || 0) > 0)
  ) {
    return {
      ask: true,
      reason: 'course_stop',
      question: ISKRA_CLARIFYING_QUESTIONS.course_stop,
    }
  }

  const style = byKey('owner:style')
  if (
    style &&
    isRecentLearningSignal(style) &&
    ((Number(style.negative_count) || 0) >= 2 || String(style.playbook_note ?? '').includes('короче'))
  ) {
    // Не дёргаем сразу после «короче» — только если накопились минусы или явная правка стиля давно
    if ((Number(style.negative_count) || 0) >= 2) {
      return {
        ask: true,
        reason: 'style',
        question: ISKRA_CLARIFYING_QUESTIONS.style,
      }
    }
  }

  const negTotal = signals.reduce((acc, s) => acc + (Number(s.negative_count) || 0), 0)
  const posTotal = signals.reduce((acc, s) => acc + (Number(s.positive_count) || 0), 0)
  if (negTotal >= 3 && negTotal > posTotal) {
    return {
      ask: true,
      reason: 'after_negative',
      question: ISKRA_CLARIFYING_QUESTIONS.after_negative,
    }
  }

  const userTurns = (opts.messages ?? []).filter((m) => m?.role === 'user').length + (userMessage ? 1 : 0)
  if (userTurns >= 4 && userTurns % 4 === 0) {
    return {
      ask: true,
      reason: 'periodic',
      question: ISKRA_CLARIFYING_QUESTIONS.periodic,
    }
  }

  return { ask: false, reason: 'no_trigger' }
}

/**
 * @param {{ reason: string, question: string }} ask
 */
export function buildClarifyingPromptRule(ask) {
  if (!ask?.question) return ''
  return [
    'УТОЧНЕНИЕ ВЛАДЕЛЬЦА (обязательно в этом ответе):',
    `В самом конце ответа добавь РОВНО одну короткую строку: «${ISKRA_CLARIFYING_PREFIX} ${ask.question}»`,
    'Не задавай других вопросов. Не ставь уточнение в середину. Сначала полезный ответ, потом эта строка.',
  ].join('\n')
}

/**
 * Последний вопрос «Уточню:» от ассистента в истории.
 * @param {Array<{ role?: string, content?: string }> | null | undefined} messages
 * @returns {{ reason: string, question: string } | null}
 */
export function findPendingClarifyingQuestion(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i]
    if (m?.role !== 'assistant') continue
    const content = String(m.content ?? '')
    const idx = content.lastIndexOf(ISKRA_CLARIFYING_PREFIX)
    if (idx < 0) continue
    const question = content.slice(idx + ISKRA_CLARIFYING_PREFIX.length).trim().replace(/^[:\s]+/, '')
    if (!question) continue
    let reason = 'periodic'
    const q = question.toLowerCase()
    if (q.includes('короче') || q.includes('шаг')) reason = 'style'
    else if (q.includes('план') || q.includes('команд') || q.includes('фокус')) reason = 'course_stop'
    else if (q.includes('поправить') || q.includes('тон')) reason = 'after_negative'
    return { reason, question }
  }
  return null
}

/**
 * Ответ владельца на «Уточню:» → заметка для памяти.
 * @param {string} userMessage
 * @param {{ reason?: string, question?: string } | null} pending
 * @returns {{ kind: string, note: string, signal_key: string } | null}
 */
export function parseClarifyingAnswer(userMessage, pending) {
  if (!pending) return null
  const answer = String(userMessage ?? '').trim()
  if (answer.length < 2 || answer.length > 280) return null
  if (detectOwnerFeedbackFromMessage(answer).length) return null

  const lower = answer.toLowerCase()
  const reason = String(pending.reason ?? 'periodic')

  if (reason === 'style') {
    if (/короч|кратко|без\s+вод|сжато/.test(lower)) {
      return {
        kind: 'style_compact',
        note: 'Стиль (ответ на уточнение): короче, без воды.',
        signal_key: 'owner:style',
      }
    }
    if (/подроб|шаг|детал|глуб/.test(lower)) {
      return {
        kind: 'style_deep',
        note: 'Стиль (ответ на уточнение): подробнее, с шагами.',
        signal_key: 'owner:style',
      }
    }
  }

  if (/план|продаж|выручк/.test(lower)) {
    return {
      kind: 'course_shift',
      note: `Фокус (ответ на уточнение): ${answer.slice(0, 160)}`,
      signal_key: 'owner:focus',
    }
  }
  if (/команд|тренер|сотруд/.test(lower)) {
    return {
      kind: 'course_shift',
      note: `Фокус (ответ на уточнение): команда — ${answer.slice(0, 140)}`,
      signal_key: 'owner:focus',
    }
  }

  return {
    kind: 'remember',
    note: `Ответ на уточнение ИСКРЫ («${String(pending.question ?? '').slice(0, 60)}»): ${answer.slice(0, 180)}`,
    signal_key: reason === 'style' ? 'owner:style' : 'owner:focus',
  }
}
