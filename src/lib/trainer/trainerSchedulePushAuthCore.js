/**
 * Push auth для trainer_schedule_entries — чистые правила (verify + mutationAuth).
 */
import { normalizeScheduleClientIds } from './trainerScheduleCore.js'

/**
 * Ежедневник пишет только тренер (планшет). Админ/управляющий/менеджер — read-only API.
 * @param {{ isTrainer?: boolean }} ctx
 */
export function canRolePushTrainerSchedule(ctx) {
  return Boolean(ctx?.isTrainer)
}

/**
 * @param {string} userId
 * @param {string} profileClub
 * @param {string} op insert|update|delete
 * @param {object} payload
 * @param {object | null | undefined} existingRow
 */
export function assertTrainerSchedulePushOwnership(userId, profileClub, op, payload, existingRow) {
  const uid = String(userId ?? '').trim()
  const club = String(profileClub ?? '').trim()
  if (!uid) return { ok: false, error: 'Unauthorized' }
  if (!club) return { ok: false, error: 'В профиле нет клуба — попросите администратора указать клуб тренеру' }

  const operation = String(op ?? '').trim()

  if (operation === 'delete' || operation === 'update') {
    if (existingRow) {
      if (String(existingRow.trainer_id ?? '') !== uid) {
        return { ok: false, error: 'Запись другого тренера' }
      }
      if (String(existingRow.club_id ?? '') !== club) {
        return { ok: false, error: 'Запись другого клуба' }
      }
    }
  }

  if (operation === 'insert' || operation === 'update') {
    if (String(payload?.trainer_id ?? '') !== uid) {
      return { ok: false, error: 'Расписание должно быть вашим' }
    }
    if (String(payload?.club_id ?? '') !== club) {
      return { ok: false, error: 'Расписание другого клуба' }
    }
  }

  return { ok: true }
}

/**
 * @param {object | null | undefined} training
 * @param {string} userId
 * @param {string} profileClub
 */
export function assertTrainerScheduleLinkedTraining(training, userId, profileClub) {
  const linkedId = String(training?.id ?? '').trim()
  if (!linkedId) return { ok: true }
  const uid = String(userId ?? '').trim()
  const club = String(profileClub ?? '').trim()
  if (String(training?.trainer_id ?? '') !== uid) {
    return { ok: false, error: 'Тренировка другого тренера' }
  }
  if (String(training?.club_id ?? '') !== club) {
    return { ok: false, error: 'Тренировка другого клуба' }
  }
  return { ok: true }
}

/** @param {unknown} rawClientIds */
export function listTrainerScheduleClientIds(rawClientIds) {
  return normalizeScheduleClientIds(rawClientIds)
}

/**
 * Отбросить записи, чей trainer_id не из разрешённого множества клуба.
 * @param {object[]} entries
 * @param {Set<string>} validTrainerIds
 */
export function filterScheduleEntriesForClubTrainers(entries, validTrainerIds) {
  if (!validTrainerIds?.size) return []
  return (entries ?? []).filter((e) => validTrainerIds.has(String(e?.trainer_id ?? '').trim()))
}

/**
 * @param {object[]} entries
 * @param {string} clubId
 */
export function filterScheduleEntriesByClubId(entries, clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  return (entries ?? []).filter((e) => String(e?.club_id ?? '').trim() === cid)
}
