/**
 * Поиск и сборка контекста базы знаний FIT-CITY для ИСКРЫ.
 * scripts/verify-iskra-knowledge-base.mjs
 */

import { ISKRA_KB_ARTICLES } from './iskraKnowledgeBaseArticles.js'

function normalizeKbQuery(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

/**
 * @param {string} userMessage
 * @param {string | null | undefined} [topic]
 */
export function scoreKbArticle(article, userMessage, topic = null) {
  const q = normalizeKbQuery(userMessage)
  if (!q) return 0
  let score = 0
  const articleTopic = String(article.topic ?? '')

  if (topic && articleTopic === topic) score += 4

  for (const kw of article.keywords ?? []) {
    const k = normalizeKbQuery(kw)
    if (!k) continue
    if (q.includes(k)) score += k.length >= 8 ? 6 : 4
  }

  if (q.includes(normalizeKbQuery(article.title))) score += 5

  return score
}

/**
 * @param {string} userMessage
 * @param {{ topic?: string | null, limit?: number }} [opts]
 */
export function searchKbArticles(userMessage, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 2)
  const topic = opts.topic ? String(opts.topic) : null

  return [...ISKRA_KB_ARTICLES]
    .map((a) => ({ article: a, score: scoreKbArticle(a, userMessage, topic) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.article)
}

/**
 * @param {import('./iskraKnowledgeBaseArticles.js').IskraKbArticle} article
 */
export function formatKbArticlePlain(article) {
  if (!article) return ''
  const steps = (article.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n')
  const notes = article.notes ? `\nПримечание: ${article.notes}` : ''
  return `${article.title}\n${steps}${notes}`
}

/**
 * @param {import('./iskraKnowledgeBaseArticles.js').IskraKbArticle} article
 */
export function formatKbArticleBrief(article) {
  if (!article) return ''
  const first = article.steps?.[0] ?? ''
  const more = (article.steps?.length ?? 0) > 1 ? ` Ещё ${article.steps.length - 1} шаг(ов) в полной инструкции.` : ''
  return `${article.title}: ${first}${more}`
}

/**
 * @param {string} userMessage
 * @param {string | null | undefined} [topic]
 */
export function buildKbInstantReply(userMessage, topic = null) {
  const hits = searchKbArticles(userMessage, { topic, limit: 1 })
  const article = hits[0]
  if (!article) return ''
  return formatKbArticlePlain(article)
}

/**
 * @param {string} userMessage
 * @param {string | null | undefined} [topic]
 */
export function buildKbPromptBlock(userMessage, topic = null) {
  const articles = searchKbArticles(userMessage, { topic, limit: 3 })
  if (!articles.length) return null

  return {
    source: 'fit_city_kb',
    matched_topics: [...new Set(articles.map((a) => a.topic))],
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      steps: a.steps,
      notes: a.notes ?? null,
    })),
    instruction:
      'Отвечай по шагам из articles. Не выдумывай кнопки и разделы. Если шагов мало — один уточняющий вопрос.',
  }
}

/**
 * @param {string | null | undefined} topic
 */
export function listKbArticlesByTopic(topic) {
  const t = String(topic ?? '').trim()
  if (!t) return ISKRA_KB_ARTICLES
  return ISKRA_KB_ARTICLES.filter((a) => a.topic === t)
}
