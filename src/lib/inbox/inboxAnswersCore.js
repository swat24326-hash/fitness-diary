/**
 * Ответы на опрос: проверка того, что прислал клиент, и итоги для админа / управляющего.
 * Ответ по вопросу: rating — 1…5, single — индекс варианта, multi — индексы, text — строка.
 */

export const INBOX_ANSWER_TEXT_MAX = 2000
export const INBOX_RESULTS_TEXT_MAX = 200

function isIndex(v, options) {
  return Number.isInteger(v) && v >= 0 && v < options.length
}

function normalizeOne(q, raw) {
  if (raw == null || raw === '') return null
  if (q.type === 'rating') {
    const n = Number(raw)
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined
  }
  if (q.type === 'single') return isIndex(raw, q.options ?? []) ? raw : undefined
  if (q.type === 'multi') {
    if (!Array.isArray(raw)) return undefined
    if (!raw.every((v) => isIndex(v, q.options ?? []))) return undefined
    const uniq = [...new Set(raw)].sort((a, b) => a - b)
    return uniq.length ? uniq : null
  }
  if (q.type === 'text') {
    const s = String(raw).replace(/\r\n/g, '\n').trim().slice(0, INBOX_ANSWER_TEXT_MAX)
    return s || null
  }
  return undefined
}

/**
 * @param {Array<{ id: string, type: string, text: string, required?: boolean, options?: string[] }>} questions
 * @param {Record<string, unknown>} raw
 * @returns {{ ok: true, answers: Record<string, unknown> } | { ok: false, error: string }}
 */
export function normalizeInboxAnswers(questions, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const answers = {}
  for (const [i, q] of (questions ?? []).entries()) {
    const v = normalizeOne(q, src[q.id])
    if (v === undefined) return { ok: false, error: `Вопрос ${i + 1}: ответ не подходит — обновите страницу` }
    if (v === null) {
      if (q.required !== false) return { ok: false, error: `Ответьте на вопрос ${i + 1}` }
      continue
    }
    answers[q.id] = v
  }
  return { ok: true, answers }
}

/**
 * Итоги опроса по доставкам (answers уже проверены при записи).
 * @param {object[]} questions
 * @param {Array<{ answers?: object|null, answered_at?: string|null, client_name?: string }>} deliveries
 */
export function summarizeInboxResults(questions, deliveries) {
  const answered = (deliveries ?? []).filter((d) => d?.answered_at && d.answers && typeof d.answers === 'object')
  return (questions ?? []).map((q) => {
    const vals = answered.map((d) => ({ v: d.answers[q.id], d })).filter((x) => x.v != null)
    const base = { id: q.id, type: q.type, text: q.text, count: vals.length }
    if (q.type === 'rating') {
      const dist = [0, 0, 0, 0, 0]
      for (const { v } of vals) if (v >= 1 && v <= 5) dist[v - 1] += 1
      const sum = dist.reduce((s, c, i) => s + c * (i + 1), 0)
      return { ...base, distribution: dist, average: vals.length ? Math.round((sum / vals.length) * 10) / 10 : null }
    }
    if (q.type === 'single' || q.type === 'multi') {
      const counts = (q.options ?? []).map(() => 0)
      for (const { v } of vals) for (const idx of Array.isArray(v) ? v : [v]) if (idx in counts) counts[idx] += 1
      return { ...base, options: (q.options ?? []).map((label, i) => ({ label, count: counts[i] })) }
    }
    const texts = vals
      .sort((a, b) => String(b.d.answered_at).localeCompare(String(a.d.answered_at)))
      .slice(0, INBOX_RESULTS_TEXT_MAX)
      .map(({ v, d }) => ({ text: String(v), client_name: d.client_name || '', at: d.answered_at }))
    return { ...base, texts }
  })
}

/** Охват рассылки: сколько получили, прочитали, ответили. */
export function inboxCampaignStats(deliveries) {
  const list = deliveries ?? []
  return {
    recipients: list.length,
    read: list.filter((d) => d?.read_at).length,
    answered: list.filter((d) => d?.answered_at).length,
  }
}
