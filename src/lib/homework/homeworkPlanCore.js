/**
 * Черновик ДЗ в памяти сессии (без sync в health_cards).
 */

import { normalizeHomeworkBlock, normalizeHomeworkItems, normalizeHomeworkPresetRow } from './homeworkPresetsCore.js'

/**
 * @typedef {{
 *   catalog_exercise_id: string | null,
 *   name: string,
 *   sets: number,
 *   reps: string,
 *   rest_sec: number,
 * }} HomeworkExerciseItem
 *
 * @typedef {{ label: string, exercises: HomeworkExerciseItem[] }} HomeworkBlock
 *
 * @typedef {{
 *   id: string,
 *   club_id: string,
 *   title: string,
 *   direction: string,
 *   description: string | null,
 *   items: { blocks: HomeworkBlock[] },
 *   sort_order: number,
 *   is_active: boolean,
 *   created_at?: unknown,
 *   updated_at?: unknown,
 * }} HomeworkPresetRow
 *
 * @typedef {{
 *   title: string,
 *   mode: 'preset' | 'builder',
 *   presetId: string | null,
 *   comment: string,
 *   blocks: HomeworkBlock[],
 * }} HomeworkDraft
 */

/** @returns {HomeworkDraft} */
export function emptyHomeworkDraft() {
  return {
    title: 'Домашнее задание',
    mode: 'builder',
    presetId: null,
    comment: '',
    blocks: [{ label: 'Основное', exercises: [] }],
  }
}

/**
 * @param {HomeworkPresetRow | object | null | undefined} preset
 * @returns {HomeworkDraft | null}
 */
export function applyHomeworkPresetToDraft(preset) {
  const row = normalizeHomeworkPresetRow(preset)
  if (!row) return null
  const items = normalizeHomeworkItems(row.items)
  const blocks = items.blocks.length
    ? items.blocks.map((b) => ({ label: b.label, exercises: b.exercises.map((ex) => ({ ...ex })) }))
    : [{ label: 'Основное', exercises: [] }]
  return {
    title: row.title,
    mode: 'preset',
    presetId: row.id,
    comment: '',
    blocks,
  }
}

/**
 * @param {HomeworkDraft | null | undefined} draft
 * @param {string} comment
 */
export function setHomeworkDraftComment(draft, comment) {
  const base = draft && typeof draft === 'object' ? draft : emptyHomeworkDraft()
  return {
    ...base,
    comment: String(comment ?? '').trim().slice(0, 500),
  }
}

/**
 * @param {HomeworkDraft | null | undefined} draft
 * @param {HomeworkExerciseItem} item
 * @param {string} [blockLabel]
 */
export function addExerciseToHomeworkDraft(draft, item, blockLabel = 'Основное') {
  const base = draft && typeof draft === 'object' ? structuredCloneSafe(draft) : emptyHomeworkDraft()
  base.mode = 'builder'
  base.presetId = null
  if (!base.title || base.title === 'Домашнее задание') {
    /* keep */
  }
  const label = String(blockLabel ?? 'Основное').trim() || 'Основное'
  let block = base.blocks.find((b) => b.label === label)
  if (!block) {
    block = { label, exercises: [] }
    base.blocks.push(block)
  }
  const normalized = {
    catalog_exercise_id: String(item.catalog_exercise_id ?? '').trim() || null,
    name: String(item.name ?? '').trim().slice(0, 120),
    sets: item.sets,
    reps: String(item.reps ?? '10'),
    rest_sec: item.rest_sec,
  }
  if (!normalized.name || !normalized.catalog_exercise_id) return base
  if (block.exercises.some((ex) => ex.catalog_exercise_id === normalized.catalog_exercise_id)) return base
  block.exercises.push(normalized)
  base.blocks = base.blocks.map((b) => normalizeHomeworkBlock(b)).filter(Boolean)
  return base
}

/**
 * @param {HomeworkDraft | null | undefined} draft
 * @param {number} blockIdx
 * @param {number} exerciseIdx
 */
export function removeExerciseFromHomeworkDraft(draft, blockIdx, exerciseIdx) {
  const base = draft && typeof draft === 'object' ? structuredCloneSafe(draft) : emptyHomeworkDraft()
  const block = base.blocks[blockIdx]
  if (!block) return base
  block.exercises = block.exercises.filter((_, i) => i !== exerciseIdx)
  base.blocks = base.blocks.filter((b) => b.exercises.length > 0)
  if (!base.blocks.length) base.blocks = [{ label: 'Основное', exercises: [] }]
  return base
}

/**
 * @param {HomeworkDraft | null | undefined} draft
 * @param {number} blockIdx
 * @param {number} exerciseIdx
 * @param {Partial<HomeworkExerciseItem>} patch
 */
export function patchHomeworkDraftExercise(draft, blockIdx, exerciseIdx, patch) {
  const base = draft && typeof draft === 'object' ? structuredCloneSafe(draft) : emptyHomeworkDraft()
  const block = base.blocks[blockIdx]
  const ex = block?.exercises?.[exerciseIdx]
  if (!ex) return base
  Object.assign(ex, patch)
  const normalized = normalizeHomeworkBlock(block)
  if (normalized) base.blocks[blockIdx] = normalized
  return base
}

/** @param {HomeworkDraft | null | undefined} draft */
export function countHomeworkExercises(draft) {
  if (!draft?.blocks) return 0
  return draft.blocks.reduce((n, b) => n + (b.exercises?.length ?? 0), 0)
}

/** @param {HomeworkDraft | null | undefined} draft */
export function isHomeworkDraftReady(draft) {
  return countHomeworkExercises(draft) > 0
}

/** @param {unknown} value */
function structuredCloneSafe(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value)
  } catch {
    /* ignore */
  }
  return JSON.parse(JSON.stringify(value))
}
