/** Маршрутизация вопросов ИСКРЫ: данные клуба vs общие знания. */

const CLUB_TOPIC_RE =
  /план|прогноз|прибыл|выручк|продаж|отчет|отчёт|финанс|возврат|абонемент|трениров|тренер|клиент|пз|тз|аз|нк|дк|ук|пнк|филиал|клуб|месяц|марж|зарплат|направлен|риск|отставан|выполнен|норма|iskra|искр/i

const IDENTITY_RE =
  /^(?:кто\s+ты|ты\s+кто|что\s+ты\s+за|представься|расскажи\s+о\s+себе|чем\s+можешь\s+помочь|чем\s+полезн)/i

/**
 * Вопрос про цифры/отчёты клуба (нужен JSON).
 * @param {string} message
 */
export function isIskraClubAnalyticsQuestion(message) {
  const s = String(message ?? '').trim()
  if (!s) return false
  if (IDENTITY_RE.test(s)) return false
  return CLUB_TOPIC_RE.test(s)
}

/**
 * «Кто ты» / возможности — отдельный instant-intro, не общие знания.
 * @param {string} message
 */
export function isIskraIdentityQuestion(message) {
  return IDENTITY_RE.test(String(message ?? '').trim())
}

/**
 * Общий вопрос (не про отчёты клуба и не «кто ты»).
 * @param {string} message
 */
export function isIskraOffTopicQuestion(message) {
  const s = String(message ?? '').trim()
  if (!s) return false
  return !isIskraClubAnalyticsQuestion(s) && !isIskraIdentityQuestion(s)
}

/**
 * Минимальный блок данных для Gemini на off-topic (без отчётов клуба).
 * @param {string} [clubName]
 */
export function buildIskraOffTopicDataBlock(clubName = '') {
  const club = String(clubName ?? '').trim() || 'филиала'
  return {
    context: 'general_knowledge_question',
    club_name_for_role_reminder: club,
  }
}

/**
 * Подсказка в user-message для Gemini: не подменять ответ самопрезентацией.
 * @param {string} message
 * @param {string} [clubName]
 */
export function buildIskraQuestionReplyHint(message, clubName = '') {
  const s = String(message ?? '').trim()
  if (!s || !isIskraOffTopicQuestion(s)) return ''

  const club = String(clubName ?? '').trim() || 'филиала'
  return (
    'Инструкция к этому вопросу: он не про отчёты клуба. ' +
    'Сначала дай краткий прямой ответ на вопрос (1–2 предложения, общие знания модели). ' +
    `Затем одним предложением напомни, что вы — ИСКРА, аналитика FIT-CITY по ${club}: план, прогноз, чистая прибыль, направления. ` +
    'Не заменяй ответ пересказом задач и не повторяй длинное приветствие.'
  )
}
