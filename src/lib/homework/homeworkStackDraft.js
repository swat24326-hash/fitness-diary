/**
 * Черновик авто-ДЗ на 4 недели: правка занятия пишет в свою неделю.
 * Клиенту уходит неделя stackWeek (ближайшее воскресенье или выбранная «неделя нагрузки»).
 */
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

/** @param {object} draft @param {number | null | undefined} weekIndex */
export function removeHomeworkStackExercise(draft, weekIndex, blockIdx, exerciseIdx) {
  if (!Array.isArray(draft?.stack) || weekIndex == null) return removeExerciseFromHomeworkDraft(draft, blockIdx, exerciseIdx)
  const stack = draft.stack.map((item, i) =>
    i === weekIndex ? { ...item, draft: removeExerciseFromHomeworkDraft(item.draft, blockIdx, exerciseIdx) } : item,
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
