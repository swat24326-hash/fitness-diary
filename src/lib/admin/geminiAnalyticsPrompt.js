/** Промпт и payload для ЭВС «ИСКРА» (Gemini backend). */

import { trimChatHistory, compactSnapshotForPrompt } from './geminiAnalyticsSnapshot.js'
import { buildIskraSystemPrompt, buildPersona } from './geminiIskraCore.js'
import { buildGeminiMonthCalendarContext } from './geminiMonthCalendarContext.js'
import { buildIskraDataAvailability } from './iskraDataAvailability.js'
import {
  buildIskraOffTopicDataBlock,
  buildIskraQuestionReplyHint,
  isIskraOffTopicQuestion,
} from './iskraQuestionRouting.js'
import {
  filterPromptDataBlockForSegment,
  resolvePanelAnalysisFocus,
} from './iskraPanelContourCore.js'
import { buildSalesAdviceContext } from './iskraSalesAdviceContextCore.js'
import { augmentPromptDataBlockForAdmin } from './iskraAdminPromptContext.js'
import { buildPlaybooksPromptBlock } from './iskraLearningCore.js'
import { mergePlaybooksForPrompt, buildSeedPlaybooksPromptRule } from './iskraBusinessPlaybooksCore.js'
import { matchIskraAppGuideIntent } from './iskraAppGuide.js'
import { buildKbPromptBlock } from './iskraKnowledgeBaseCore.js'
import {
  GEMINI_RESPONSE_BRIEF_RULE,
  isGeminiReplyIncompleteForMode,
  normalizeIskraResponseMode,
  resolveChatHistoryTurns,
  resolveGeminiGenerationConfig,
  resolveIskraResponseMode,
} from './iskraResponseModeCore.js'

export { buildPersona }

/** Сначала lite — дешевле и стабильнее на free tier Google AI Studio (2026). */
export const GEMINI_ANALYTICS_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
]

export const GEMINI_ANALYTICS_MODEL = GEMINI_ANALYTICS_MODELS[0]

/** Лимит длины ответа для чата и озвучки (режим brief — чипы и TTS). */
export const GEMINI_GENERATION_CONFIG = resolveGeminiGenerationConfig('brief')

export const GEMINI_GENERATION_CONFIG_RETRY = resolveGeminiGenerationConfig('brief', true)

export { GEMINI_RESPONSE_BRIEF_RULE }

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
 * @param {{ advisorRole?: object, responseMode?: string }} [opts]
 */
export function buildSystemPrompt(_gender, clubName, opts = {}) {
  const mode =
    normalizeIskraResponseMode(opts.responseMode) ||
    resolveIskraResponseMode({ advisorRoleId: opts.advisorRole?.id ?? 'app_admin' })
  return buildIskraSystemPrompt(clubName, { ...opts, responseMode: mode })
}

/** Компактный блок данных для промпта (меньше шума для модели). */
export function buildGeminiPromptDataBlock(snapshot, previousSnapshot = null, opts = {}) {
  const selectedTrainerId = opts.selectedTrainerId ?? snapshot?.trainer_contour?.selected_trainer_id ?? null
  const panelSegment = opts.panelSegment === 'trainer' ? 'trainer' : 'sales'
  const current = compactSnapshotForPrompt(snapshot, panelSegment === 'trainer' ? selectedTrainerId : null)
  const responseMode =
    normalizeIskraResponseMode(opts.responseMode) ||
    resolveIskraResponseMode({ advisorRoleId: opts.advisorRoleId ?? 'app_admin' })
  const calendarContext =
    snapshot?.calendar_context ??
    buildGeminiMonthCalendarContext(snapshot?.period?.year, snapshot?.period?.month)
  const analysisFocus = resolvePanelAnalysisFocus({
    segment: panelSegment,
    trainerId: selectedTrainerId,
  })
  let block = {
    analysis_period: current?.period?.label ?? '',
    analysis_focus: analysisFocus,
    panel_segment: panelSegment,
    advisor_role_id: opts.advisorRoleId ?? 'app_admin',
    response_mode: responseMode,
    advisor_advice: opts.advisorAdvice ?? null,
    calendar_context: calendarContext,
    sales_contour: current?.sales_contour ?? null,
    trainer_contour: current?.trainer_contour ?? null,
    finance: current?.finance ?? null,
    trainings: current?.trainings ?? null,
    insights: current?.insights ?? null,
    month_forecast: current?.month_forecast ?? snapshot?.month_forecast ?? null,
    club_finance: current?.club_finance ?? snapshot?.club_finance ?? null,
    data_sources: current?.data_sources ?? null,
    data_availability: buildIskraDataAvailability(snapshot, {
      hasPreviousPeriod: !!previousSnapshot,
      selectedTrainerId: panelSegment === 'trainer' ? selectedTrainerId : null,
    }),
    current_period: current?.period ?? null,
  }
  if (panelSegment === 'sales') {
    block.sales_advice_context = buildSalesAdviceContext(snapshot)
  }
  const userMessage = String(opts.userMessage ?? '').trim()
  const appTopic = matchIskraAppGuideIntent(userMessage)
  if (appTopic || /приложен|fit-?city|как\s+(создать|добавить|синхрон|работ)/i.test(userMessage)) {
    block.app_knowledge = buildKbPromptBlock(userMessage, appTopic)
  }
  if (previousSnapshot) {
    const prev = compactSnapshotForPrompt(
      previousSnapshot,
      panelSegment === 'trainer' ? selectedTrainerId : null,
    )
    block.previous_period = {
      period: prev?.period ?? null,
      sales_contour: panelSegment === 'sales' ? prev?.sales_contour ?? null : null,
      trainer_contour: panelSegment === 'trainer' ? prev?.trainer_contour ?? null : null,
      insights: panelSegment === 'sales' ? prev?.insights ?? null : null,
    }
  }
  block = augmentPromptDataBlockForAdmin(block, snapshot, {
    responseMode,
    dispatchOpen: opts.dispatchOpen,
    previousSnapshot: opts.previousSnapshot ?? previousSnapshot,
    playbooks:
      opts.playbooks ??
      mergePlaybooksForPrompt({
        clubPlaybooks: buildPlaybooksPromptBlock(opts.learningBundle),
        snapshot,
        limit: 8,
      }),
    panelSegment,
  })
  block = filterPromptDataBlockForSegment(block, panelSegment, selectedTrainerId)
  return block
}

/** @param {string} text @param {string} [finishReason] @param {string} [responseMode] */
export function isGeminiReplyIncomplete(text, finishReason, responseMode = 'brief') {
  const mode = normalizeIskraResponseMode(responseMode) || 'brief'
  return isGeminiReplyIncompleteForMode(text, finishReason, mode)
}

/**
 * @param {object} opts
 * @returns {{ systemInstruction: object, contents: object[] }}
 */
export function buildGeminiGeneratePayload(opts) {
  const gender = opts.gender === 'female' ? 'female' : 'male'
  const clubName = String(opts.clubName ?? opts.snapshot?.club_name ?? '').trim()
  const responseMode = resolveIskraResponseMode({
    advisorRoleId: opts.advisorRoleId ?? opts.advisorRole?.id ?? 'app_admin',
    userMessage: opts.userMessage,
    explicitMode: opts.responseMode,
    comparePrevious: opts.comparePrevious === true,
  })
  const panelSegment = opts.panelSegment === 'trainer' ? 'trainer' : 'sales'
  const history = trimChatHistory(opts.messages, resolveChatHistoryTurns(responseMode))
  const userMessage = String(opts.userMessage ?? '').trim()
  const dataBlock = buildGeminiPromptDataBlock(opts.snapshot, opts.previousSnapshot, {
    selectedTrainerId: opts.selectedTrainerId,
    panelSegment,
    userMessage,
    advisorRoleId: opts.advisorRoleId,
    advisorAdvice: opts.advisorAdvice,
    responseMode,
    dispatchOpen: opts.dispatchOpen,
    learningBundle: opts.learningBundle,
  })
  const periodLabel = dataBlock.analysis_period || 'период не задан'
  const offTopic = isIskraOffTopicQuestion(userMessage)
  const replyHint = buildIskraQuestionReplyHint(userMessage, clubName)
  const questionBlock = replyHint
    ? `Вопрос: ${userMessage}\n\n${replyHint}`
    : `Вопрос: ${userMessage}`
  const promptOpts = {
    promptAppend: opts.promptAppend,
    panelSegment,
    selectedTrainerId: opts.selectedTrainerId,
    userMessage,
    snapshot: opts.snapshot,
    analysisFocus: dataBlock.analysis_focus,
    advisorRole: opts.advisorRole ?? null,
    responseMode,
  }
  const payloadDataBlock = offTopic ? buildIskraOffTopicDataBlock(clubName) : dataBlock

  const parts = []
  if (history.length === 0) {
    parts.push({
      text: offTopic
        ? questionBlock
        : `Период анализа (только он): ${periodLabel}\n\nДанные (JSON):\n${JSON.stringify(payloadDataBlock)}\n\n${questionBlock}`,
    })
  } else {
    for (const msg of history) {
      parts.push({
        text: msg.role === 'assistant' ? `[${buildPersona(gender).name}]: ${msg.content}` : `[Руководитель]: ${msg.content}`,
      })
    }
    parts.push({
      text: offTopic
        ? questionBlock
        : `Период анализа (только он): ${periodLabel}\n\nАктуальные данные (JSON):\n${JSON.stringify(payloadDataBlock)}\n\n${questionBlock}`,
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
    responseMode,
    generationConfig: resolveGeminiGenerationConfig(responseMode),
    generationConfigRetry: resolveGeminiGenerationConfig(responseMode, true),
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
