/**
 * Действия Ежедневника на планшете: IndexedDB + очередь sync. Телефон подставляет свои (через сервер) —
 * общие модалка и перенос зовут только этот контракт.
 */
import { listScheduleFollowingSiblings } from './trainerScheduleRecurrenceCore.js'
import {
  deleteTrainerScheduleEntries,
  deleteTrainerScheduleEntry,
  moveTrainerScheduleEntry,
  saveTrainerScheduleEntry,
  saveTrainerScheduleEntryCopies,
} from './trainerScheduleService.js'

export const trainerScheduleLocalActions = {
  /** @param {object} input @param {object | null} [_draft] */
  save: (input, _draft) => saveTrainerScheduleEntry(input),
  saveCopies: (entry, days) => saveTrainerScheduleEntryCopies(entry, days),
  /**
   * @param {object} entry
   * @param {{ scope?: 'one' | 'following', entries?: object[] }} [opts]
   */
  remove: (entry, opts = {}) => {
    if (opts.scope === 'following') {
      const rows = listScheduleFollowingSiblings(opts.entries ?? [], entry)
      return deleteTrainerScheduleEntries(rows.map((r) => r.id))
    }
    return deleteTrainerScheduleEntry(entry?.id)
  },
  move: moveTrainerScheduleEntry,
}
