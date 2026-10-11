/**
 * Действия Ежедневника на планшете: IndexedDB + очередь sync. Телефон подставляет свои (через сервер) —
 * общие модалка и перенос зовут только этот контракт.
 */
import {
  deleteTrainerScheduleEntry,
  moveTrainerScheduleEntry,
  saveTrainerScheduleEntry,
  saveTrainerScheduleEntryCopies,
} from './trainerScheduleService.js'

export const trainerScheduleLocalActions = {
  /** @param {object} input @param {object | null} [_draft] */
  save: (input, _draft) => saveTrainerScheduleEntry(input),
  saveCopies: (entry, days) => saveTrainerScheduleEntryCopies(entry, days),
  remove: (entry) => deleteTrainerScheduleEntry(entry?.id),
  move: moveTrainerScheduleEntry,
}
