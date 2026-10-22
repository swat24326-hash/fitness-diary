/**
 * Черновик авто-ДЗ на 4 недели: правка занятия пишет в свою неделю.
 * Клиенту уходит неделя stackWeek (ближайшее воскресенье или выбранная «неделя нагрузки»).
 */
import { homeworkItemFromLibrary, homeworkPhaseFromLabel } from './homeworkAddExercise.js'
import {
  patchHomeworkDraftExercise,
  removeExerciseFromHomeworkDraft,
  setHomeworkDraftComment,
} from './homeworkPlanCore.js'

function activeIndex(draft) {
  return Math.max(0, (Number(draft?.stackWeek) || 1) - 1)
}

function replaceWeek(draft, stack, weekIndex) {
  const activeIdx = activeIndex(draft)
  if (weekIndex !== activeIdx) return { ...draft, stack }
  const active = stack[activeIdx]?.draft ?? draft
  return { ...active, stack, stackWeek: draft.stackWeek, auto_sunday: draft.auto_sunday, sendSunday: draft.sendSunday }
}

/** @param {object} draft @param {number | null | undefined} weekIndex */
export function patchHomeworkStackExercise(draft, weekIndex, blockIdx, exerciseIdx, patch) {
  if (!Array.isArray(draft?.stack) || weekIndex == null) return patchHomeworkDraftExercise(draft, blockIdx, exerciseIdx, patch)
  const stack = draft.stack.map((item, i) =>
    i === weekIndex ? { ...item, draft: patchHomeworkDraftExercise(item.draft, blockIdx, exerciseIdx, patch) } : item,
  )
  return replaceWeek(draft, stack, weekIndex)
}

function keepSessionBlock(block) {
  return (block.exercises?.length ?? 0) > 0 || /^Занятие /.test(String(block.label ?? ''))
}

/** Пустую часть занятия оставляем: иначе некуда нажать «Добавить». */
function dropExercise(weekDraft, blockIdx, exerciseIdx) {
  const blocks = (weekDraft?.blocks ?? [])
    .map((block, i) =>
      i === blockIdx
        ? { ...block, exercises: (block.exercises ?? []).filter((_, j) => j !== exerciseIdx) }
        : block,
    )
    .filter(keepSessionBlock)
  return { ...weekDraft, blocks }
}

function insertExercise(weekDraft, blockIdx, item) {
  const blocks = (weekDraft?.blocks ?? []).map((block, i) => {
    if (i !== blockIdx) return block
    const exercises = block.exercises ?? []
    const same = exercises.some((ex) => ex.library_id === item.library_id || ex.name === item.name)
    return same ? block : { ...block, exercises: [...exercises, item] }
  })
  return { ...weekDraft, blocks }
}

/** @param {object} draft @param {number | null | undefined} weekIndex */
export function removeHomeworkStackExercise(draft, weekIndex, blockIdx, exerciseIdx) {
  if (!Array.isArray(draft?.stack) || weekIndex == null) return removeExerciseFromHomeworkDraft(draft, blockIdx, exerciseIdx)
  const stack = draft.stack.map((item, i) =>
    i === weekIndex ? { ...item, draft: dropExercise(item.draft, blockIdx, exerciseIdx) } : item,
  )
  return replaceWeek(draft, stack, weekIndex)
}

/** Упражнение из библиотеки — в конец выбранной части занятия. Повтор того же названия не добавляется. */
export function addHomeworkStackExercise(draft, weekIndex, blockIdx, entry) {
  const source = Array.isArray(draft?.stack) && weekIndex != null ? draft.stack[weekIndex]?.draft : draft
  const item = homeworkItemFromLibrary(entry, homeworkPhaseFromLabel(source?.blocks?.[blockIdx]?.label))
  if (!item) return draft
  if (!Array.isArray(draft?.stack) || weekIndex == null) return insertExercise(draft, blockIdx, item)
  const stack = draft.stack.map((row, i) =>
    i === weekIndex ? { ...row, draft: insertExercise(row.draft, blockIdx, item) } : row,
  )
  return replaceWeek(draft, stack, weekIndex)
}

/** Комментарий — у недели, которая уйдёт клиенту. */
export function setHomeworkStackComment(draft, comment) {
  const next = setHomeworkDraftComment(draft, comment)
  if (!Array.isArray(draft?.stack)) return next
  const activeIdx = activeIndex(draft)
  const stack = draft.stack.map((item, i) =>
    i === activeIdx ? { ...item, draft: { ...item.draft, comment: next.comment } } : item,
  )
  return { ...next, stack }
}
