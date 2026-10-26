/**
 * Действия Ежедневника телефона для общих модалки и переноса — тот же контракт, что trainerScheduleLocalActions,
 * только через сервер. Запись устарела или удалена (409/404) — onStale перечитывает экран.
 */
import { COACH_SCHEDULE_EDIT_FIELDS } from '../trainer/coachScheduleEditCore.js'
import { listScheduleFollowingSiblings } from '../trainer/trainerScheduleRecurrenceCore.js'
import {
  deleteCoachScheduleEntry,
  saveCoachScheduleCopies,
  saveCoachScheduleEntry,
} from './coachApiClient.js'
import { CoachSessionGoneError } from './coachSession.js'

function pickEditable(input) {
  const out = input?.id ? { id: input.id } : {}
  for (const key of COACH_SCHEDULE_EDIT_FIELDS) {
    if (input && Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key]
  }
  return out
}

/** @param {{ onStale: () => void, onSessionGone: (message?: string) => void }} hooks */
export function createCoachScheduleActions({ onStale, onSessionGone }) {
  const run = async (fn) => {
    try {
      return { ok: true, ...(await fn()) }
    } catch (e) {
      if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
      else if (e?.status === 409 || e?.status === 404) onStale()
      return { ok: false, error: e?.message || 'Не получилось — попробуйте ещё раз', created: Number(e?.payload?.created) || 0 }
    }
  }
  const save = (input, draft) => run(() => saveCoachScheduleEntry(pickEditable(input), draft?.updated_at))
  return {
    save,
    saveCopies: (entry, days) => run(() => saveCoachScheduleCopies(pickEditable({ ...entry, id: undefined }), days)),
    /**
     * @param {object} entry
     * @param {{ scope?: 'one' | 'following', entries?: object[] }} [opts]
     */
    remove: async (entry, opts = {}) => {
      if (opts.scope === 'following') {
        const rows = listScheduleFollowingSiblings(opts.entries ?? [], entry)
        let deleted = 0
        for (const row of rows) {
          const res = await run(() => deleteCoachScheduleEntry(row?.id, row?.updated_at))
          if (!res.ok) return { ...res, deleted }
          deleted += 1
        }
        return { ok: true, deleted }
      }
      return run(() => deleteCoachScheduleEntry(entry?.id, entry?.updated_at))
    },
    move: (entry, dayIso, startMinutes) => save({ id: entry?.id, day_date: dayIso, start_minutes: startMinutes }, entry),
  }
}
