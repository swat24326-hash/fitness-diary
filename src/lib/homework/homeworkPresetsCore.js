/**
 * Нормализация homework_presets и merge при pull.
 */

/** @param {unknown} value */
function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** @param {unknown} raw */
export function normalizeHomeworkExerciseItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const name = String(r.name ?? '').trim().slice(0, 120)
  if (!name) return null
  const catalogId = String(r.catalog_exercise_id ?? r.exerciseId ?? '').trim() || null
  return {
    catalog_exercise_id: catalogId,
    name,
    sets: clampInt(r.sets, 2, 1, 20),
    reps: String(r.reps ?? '10').trim().slice(0, 40) || '10',
    rest_sec: clampInt(r.rest_sec ?? r.restSec, 30, 0, 600),
  }
}

/** @param {unknown} raw */
export function normalizeHomeworkBlock(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const label = String(r.label ?? '').trim().slice(0, 80) || 'Блок'
  const exercises = (Array.isArray(r.exercises) ? r.exercises : [])
    .map((ex) => normalizeHomeworkExerciseItem(ex))
    .filter(Boolean)
  if (!exercises.length) return null
  return { label, exercises }
}

/** @param {unknown} raw */
export function normalizeHomeworkItems(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return { blocks: [] }
    }
  }
  if (!obj || typeof obj !== 'object') return { blocks: [] }
  const blocks = (Array.isArray(/** @type {Record<string, unknown>} */ (obj).blocks)
    ? /** @type {Record<string, unknown>} */ (obj).blocks
    : []
  )
    .map((b) => normalizeHomeworkBlock(b))
    .filter(Boolean)
  return { blocks }
}

/** @param {object[]} [syncQueueItems] */
export function buildPendingHomeworkPresetKeys(syncQueueItems) {
  const pendingUpdates = new Set()
  const pendingInserts = new Set()
  for (const item of syncQueueItems ?? []) {
    if (item.table_name !== 'homework_presets') continue
    if (item.operation === 'insert') {
      const id = String(item.data?.id ?? '').trim()
      if (id) pendingInserts.add(id)
      continue
    }
    if (item.operation === 'update') {
      const id = String(item.remote_id ?? item.data?.id ?? '').trim()
      if (id) pendingUpdates.add(id)
    }
  }
  return { pendingUpdates, pendingInserts }
}

export function shouldApplyRemoteHomeworkPresetRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}

export function shouldDeleteLocalHomeworkPresetRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id || p.remoteIds.has(id)) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}

/**
 * Подставляет catalog_exercise_id по точному имени из справочника.
 * @param {{ blocks?: Array<{ label?: string, exercises?: object[] }> } | null | undefined} blocksPayload
 * @param {Array<{ id?: string, name?: string }>} catalog
 */
export function enrichHomeworkBlocksWithCatalog(blocksPayload, catalog) {
  const byName = new Map()
  for (const row of catalog ?? []) {
    const key = String(row.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
    if (key && row.id) byName.set(key, row.id)
  }
  const blocks = (blocksPayload?.blocks ?? []).map((block) => ({
    label: block.label,
    exercises: (block.exercises ?? []).map((ex) => {
      const key = String(ex.name ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
      const catalogId = byName.get(key) ?? ex.catalog_exercise_id ?? null
      return { ...ex, catalog_exercise_id: catalogId }
    }),
  }))
  return { blocks }
}

/**
 * @param {unknown} raw
 * @returns {import('./homeworkPlanCore.js').HomeworkPresetRow | null}
 */
export function normalizeHomeworkPresetRow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const id = String(r.id ?? '').trim()
  const clubId = String(r.club_id ?? '').trim()
  const title = String(r.title ?? '').trim().slice(0, 80)
  if (!id || !clubId || !title) return null
  return {
    id,
    club_id: clubId,
    title,
    direction: String(r.direction ?? '').trim().slice(0, 80),
    description: String(r.description ?? '').trim().slice(0, 280) || null,
    items: normalizeHomeworkItems(r.items),
    sort_order: Number(r.sort_order) || 0,
    is_active: r.is_active !== false,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  }
}
