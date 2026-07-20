/** Маршрутизация вопросов ИСКРЫ: данные клуба vs общие знания. */
const CLUB_TOPIC_RE =
  /план|прогноз|прибыл|выручк|продаж|отчет|отчёт|финанс|возврат|абонемент|трениров|тренер|клиент|пз|тз|аз|нк|дк|ук|пнк|филиал|клуб|месяц|марж|зарплат|направлен|риск|отставан|выполнен|норма|iskra|искр/i
const IDENTITY_RE =
  /^(?:кто\s+ты|ты\s+кто|что\s+ты\s+за|представься|расскажи\s+о\s+себе|чем\s+можешь\s+помочь|чем\s+полезн)/i
/** Живые переходы между ответом и напоминанием о роли (off-topic). */
export const ISKRA_OFF_TOPIC_BRIDGE_PHRASES = [
  'Не отвлекайтесь — месяц сам не закроется.',
  'Справочник отложим: важнее ваш план.',
  'Красиво, но касса сама себя не посчитает.',
  'География принята — возвращаемся к выручке.',
  'Лирика на потом, сначала цифры клуба.',
  'Любопытство одобряю, но приоритет — план продаж.',
  'Энциклопедия закрыта, врубаем сводку.',
  'Мимо кассы не ходим — к делу.',
  'Ответ есть, теперь главное — ваш филиал.',
  'Не увлекайтесь: отчёт ждать не будет.',
  'Достаточно теории — сверим факт с планом.',
  'Занимательно, но бизнес идёт без пауз.',
  'Запомнили — переключаемся на прибыль.',
  'Вне бортового журнала, но разум ценю.',
  'Хватит экскурсий — на связи по цифрам.',
  'Товарищ руководитель, голова в отчётах.',
  'Справка выдана — к пульту управления.',
  'Отвлечение зафиксировано, возвращаемся к плану.',
  'Мир большой, а ваш план — здесь и сейчас.',
  'Ответ засчитан, продолжаем по делу.',
  'Побочный вопрос снят с экрана — к сводке.',
  'Фокус на филиале, остальное потом.',
]
const OFF_TOPIC_IDENTITY_RE =
  /(?:^|[.!?…]\s*)(?:искра\s*[—–-]\s*(?:это|являюсь)|бортовой\s+аналитический\s+модуль|эвс\s*[«"]?искра|специализирующ(?:ая|ийся)\s+на\s+анализе)/i
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
 * Короткое напоминание о роли без тавтологии «ИСКРА — это ИСКРА».
 * @param {string} [clubName]
 */
export function buildIskraRoleReminderPhrase(clubName = '') {
  const club = String(clubName ?? '').trim() || 'филиала'
  return `По цифрам ${club} — план, прогноз и прибыль: спрашивайте.`
}
function offTopicPhraseSeed(userMessage = '', clubName = '') {
  return String(`${userMessage ?? ''}${clubName ?? ''}`)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}
/**
 * Одна живая фраза-переход (детерминированно по вопросу).
 * @param {string} [userMessage]
 * @param {string} [clubName]
 */
export function pickIskraOffTopicBridgePhrase(userMessage = '', clubName = '') {
  const list = ISKRA_OFF_TOPIC_BRIDGE_PHRASES
  if (!list.length) return 'К делу.'
  const idx = Math.abs(offTopicPhraseSeed(userMessage, clubName)) % list.length
  return list[idx]
}
function stripTrailingRoleReminder(text) {
  return String(text ?? '')
    .replace(/\s*По\s+цифрам[^.!?…]+[.!?…]?\s*$/i, '')
    .trim()
}
function stripKnownBridgePhrases(text) {
  let s = String(text ?? '')
  for (const phrase of ISKRA_OFF_TOPIC_BRIDGE_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`[.!?…]?\\s*${escaped}`, 'gi'), '')
  }
  return s.replace(/\s{2,}/g, ' ').trim()
}
function cleanOffTopicAnswerBody(text) {
  const isIdentitySentence = (sent) => {
    const t = String(sent ?? '').trim()
    if (!t) return false
    if (OFF_TOPIC_IDENTITY_RE.test(t)) return true
    if (/^искра\s*[—–-]/i.test(t) && /эвс|бортовой|модуль|специализ|аналитическ/i.test(t)) return true
    return false
  }
  const sentences = String(text ?? '')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter((part) => String(part).trim())
  let body = sentences.filter((sent) => !isIdentitySentence(sent)).join(' ').trim()
  body = body
    .replace(/[,.]?\s*ИСКРА\s*[—–-]\s*это[^.!?]+/gi, '')
    .replace(/[,.]?\s*бортовой\s+аналитический\s+модуль[^.!?]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  body = stripKnownBridgePhrases(body)
  body = stripTrailingRoleReminder(body)
  return body.replace(/\s*[.!?…]+\s*$/, '').trim()
}
/**
 * Собирает off-topic ответ: факт → живая фраза → напоминание о роли.
 * @param {string} answerBody
 * @param {string} [clubName]
 * @param {string} [userMessage]
 */
export function formatIskraOffTopicReply(answerBody, clubName = '', userMessage = '') {
  const body = cleanOffTopicAnswerBody(answerBody)
  const bridge = pickIskraOffTopicBridgePhrase(userMessage, clubName)
  const reminder = buildIskraRoleReminderPhrase(clubName)
  if (!body) return `${bridge} ${reminder}`
  return `${body}. ${bridge} ${reminder}`
}
/**
 * Убирает самопрезентацию; в JARVIS не навязывает хвост «По цифрам».
 * @param {string} text
 * @param {string} [clubName]
 * @param {string} [userMessage]
 * @param {{ jarvis?: boolean }} [opts]
 */
export function normalizeIskraOffTopicReply(text, clubName = '', userMessage = '', opts = {}) {
  const s = String(text ?? '').trim()
  if (!s) return s
  if (opts.jarvis === true) {
    const body = cleanOffTopicAnswerBody(s)
    return body || s
  }
  return formatIskraOffTopicReply(s, clubName, userMessage)
}
/**
 * Подсказка в user-message для Gemini.
 * @param {string} message
 * @param {string} [clubName]
 * @param {{ jarvis?: boolean }} [opts]
 */
export function buildIskraQuestionReplyHint(message, _clubName = '', opts = {}) {
  const s = String(message ?? '').trim()
  if (!s || !isIskraOffTopicQuestion(s)) return ''
  if (opts.jarvis === true) {
    return (
      'Инструкция к этому вопросу: тема шире дневных отчётов, режим JARVIS. ' +
      'Дай сильный полезный ответ по сути (практика, исследование, методика). ' +
      'Если в JSON есть факты клуба по теме — опирайся на них. ' +
      'Не обязателен хвост «По цифрам…». Без самопрезентации «ИСКРА — это…» / ЭВС.'
    )
  }
  return (
    'Инструкция к этому вопросу: он не про отчёты клуба. ' +
    'Дай только краткий прямой ответ на вопрос (1–2 предложения, общие знания). ' +
    'Не добавляй напоминание о роли, переходные фразы и самопрезентацию — их допишет система. ' +
    'Запрещено: «ИСКРА — это…», «бортовой модуль», «ЭВС», «По цифрам…».'
  )
}
