/**
 * Быстрые пометки в листе клубного звонка (после запуска набора).
 */

/** @typedef {{ id: string, label: string, note: string }} ClubCallSheetNoteChip */

/** @type {ClubCallSheetNoteChip[]} */
export const CLUB_CALL_SHEET_NOTE_CHIPS = [
  { id: 'missed', label: 'Не взял', note: 'Не взял — перезвонить' },
  { id: 'short', label: 'Сброс', note: 'Сброс — уточнить' },
  { id: 'callback', label: 'Перезвонить', note: 'Перезвонить' },
  { id: 'thinks', label: 'Думает', note: 'Думает про УК' },
]

/**
 * Подставить текст чипа в черновик (замена — один смысл на пометку).
 * @param {string} chipNote
 * @param {number} [maxLen]
 * @returns {string}
 */
export function clubCallSheetNoteFromChip(chipNote, maxLen = 400) {
  const t = String(chipNote ?? '').trim()
  if (!t) return ''
  const max = Number(maxLen) > 0 ? Math.floor(Number(maxLen)) : 400
  return t.length <= max ? t : t.slice(0, max)
}
