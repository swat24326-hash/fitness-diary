/** @typedef {{ id: string, title: string, done: boolean, done_at: string | null, order: number }} DispatchTaskStage */

export const DISPATCH_STAGES_MAX = 8
export const DISPATCH_STAGE_TITLE_MAX = 120

/**
 * @param {unknown} raw
 */
export function parseDispatchStages(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null
      const title = String(row.title ?? '').trim().slice(0, DISPATCH_STAGE_TITLE_MAX)
      if (!title) return null
      const id = String(row.id ?? `st${idx + 1}`).trim().slice(0, 32) || `st${idx + 1}`
      return {
        id,
        title,
        done: Boolean(row.done),
        done_at: row.done_at ? String(row.done_at) : null,
        order: Number.isFinite(Number(row.order)) ? Math.trunc(Number(row.order)) : idx,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
}

/**
 * @param {unknown} raw
 */
export function normalizeDispatchStagesInput(raw) {
  const titles = Array.isArray(raw?.stages)
    ? raw.stages
    : Array.isArray(raw?.stage_titles)
      ? raw.stage_titles
      : []

  const cleaned = titles
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .slice(0, DISPATCH_STAGES_MAX)

  return cleaned.map((title, order) => ({
    id: `st${order + 1}`,
    title: title.slice(0, DISPATCH_STAGE_TITLE_MAX),
    done: false,
    done_at: null,
    order,
  }))
}

/**
 * @param {DispatchTaskStage[]} stages
 * @param {string} stageId
 */
export function completeDispatchStage(stages, stageId) {
  const id = String(stageId ?? '').trim()
  if (!id) return { ok: false, error: 'Укажите stage_id', stages: parseDispatchStages(stages) }

  const list = parseDispatchStages(stages)
  const hit = list.find((s) => s.id === id)
  if (!hit) return { ok: false, error: 'Этап не найден', stages: list }
  if (hit.done) return { ok: true, stages: list, alreadyDone: true }

  const now = new Date().toISOString()
  const next = list.map((s) => (s.id === id ? { ...s, done: true, done_at: now } : s))
  return { ok: true, stages: next, alreadyDone: false }
}

/**
 * @param {unknown} stages
 */
export function countDispatchStagesDone(stages) {
  const list = parseDispatchStages(stages)
  const done = list.filter((s) => s.done).length
  return { done, total: list.length, list }
}

/**
 * @param {unknown} stages
 */
export function allDispatchStagesDone(stages) {
  const { done, total } = countDispatchStagesDone(stages)
  return total > 0 && done === total
}

/**
 * @param {unknown} stages
 */
export function hasDispatchStages(stages) {
  return countDispatchStagesDone(stages).total > 0
}

/**
 * @param {unknown} stages
 */
export function buildDispatchStagesProgress(stages) {
  const { done, total } = countDispatchStagesDone(stages)
  if (!total) return null

  const pct = Math.round((done / total) * 100)
  return {
    done,
    total,
    pct,
    label: `Этапы: ${done}/${total}`,
    tone: done === total ? 'done' : done > 0 ? 'active' : 'pending',
    hasStages: true,
  }
}

/**
 * @param {unknown} stages
 */
export function formatDispatchStagesLabel(stages) {
  const progress = buildDispatchStagesProgress(stages)
  return progress?.label ?? ''
}

/**
 * Сброс этапов при новом цикле повторяющегося задания.
 * @param {unknown} stages
 */
export function resetDispatchStagesForSpawn(stages) {
  return parseDispatchStages(stages).map((s) => ({
    ...s,
    done: false,
    done_at: null,
  }))
}

/**
 * @param {string} dispatchId
 * @param {string} stageId
 */
export function normalizeCompleteStagePayload(dispatchId, stageId) {
  const id = String(dispatchId ?? '').trim()
  const sid = String(stageId ?? '').trim()
  if (!id) return { ok: false, error: 'Укажите dispatch_id' }
  if (!sid) return { ok: false, error: 'Укажите stage_id' }
  return { ok: true, dispatch_id: id, stage_id: sid }
}
