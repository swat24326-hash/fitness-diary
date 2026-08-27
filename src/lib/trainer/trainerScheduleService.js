import { getDb } from '../localDb.js'
import { saveLocalWithSync, deleteLocalWithSync } from '../syncService.js'
import { dispatchLocalDataChanged } from '../localDataEvents.js'
import {
  normalizeTrainerScheduleEntry,
  SCHEDULE_DEFAULT_DURATION_MIN,
} from './trainerScheduleCore.js'

/**
 * @param {string} trainerId
 * @param {{ dayFrom?: string, dayTo?: string }} [opts]
 */
export async function listTrainerScheduleEntries(trainerId, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return []
  let db
  try {
    db = await getDb()
  } catch {
    return []
  }
  if (!db.objectStoreNames.contains('trainer_schedule_entries')) {
    return []
  }
  /** @type {object[]} */
  let rows = []
  try {
    rows = await db.getAllFromIndex('trainer_schedule_entries', 'by_trainer_id', tid)
  } catch {
    try {
      rows = (await db.getAll('trainer_schedule_entries')).filter((r) => String(r?.trainer_id) === tid)
    } catch {
      return []
    }
  }
  const dayFrom = String(opts.dayFrom ?? '').slice(0, 10)
  const dayTo = String(opts.dayTo ?? '').slice(0, 10)
  return rows
    .map((r) => normalizeTrainerScheduleEntry(r))
    .filter(Boolean)
    .filter((r) => {
      if (dayFrom && r.day_date < dayFrom) return false
      if (dayTo && r.day_date > dayTo) return false
      return true
    })
    .sort(
      (a, b) =>
        a.day_date.localeCompare(b.day_date) ||
        a.start_minutes - b.start_minutes ||
        String(a.id).localeCompare(String(b.id)),
    )
}

/**
 * @param {{
 *   id?: string,
 *   club_id: string,
 *   trainer_id: string,
 *   day_date: string,
 *   start_minutes: number,
 *   duration_minutes?: number,
 *   title?: string,
 *   client_ids?: string[],
 *   linked_training_id?: string | null,
 * }} input
 */
export async function saveTrainerScheduleEntry(input) {
  const existingId = String(input?.id ?? '').trim()
  const isNew = !existingId
  const now = new Date().toISOString()
  let prevCreated = now
  if (!isNew) {
    try {
      const db = await getDb()
      const prev = await db.get('trainer_schedule_entries', existingId)
      if (prev?.created_at) prevCreated = String(prev.created_at)
    } catch {
      /* ignore */
    }
  }
  const row = normalizeTrainerScheduleEntry({
    id: isNew ? crypto.randomUUID() : existingId,
    club_id: input.club_id,
    trainer_id: input.trainer_id,
    day_date: input.day_date,
    start_minutes: input.start_minutes,
    duration_minutes: input.duration_minutes ?? SCHEDULE_DEFAULT_DURATION_MIN,
    title: input.title ?? '',
    client_ids: input.client_ids ?? [],
    linked_training_id: input.linked_training_id ?? null,
    created_at: prevCreated,
    updated_at: now,
    synced: false,
  })
  if (!row) {
    return { ok: false, error: 'Укажите текст заметки или выберите клиента' }
  }
  await saveLocalWithSync('trainer_schedule_entries', row, {
    table_name: 'trainer_schedule_entries',
    operation: isNew ? 'insert' : 'update',
    remote_id: isNew ? null : row.id,
  })
  dispatchLocalDataChanged({ reason: 'trainer-schedule' })
  return { ok: true, entry: row }
}

/** @param {string} id */
export async function deleteTrainerScheduleEntry(id) {
  const pid = String(id ?? '').trim()
  if (!pid) return { ok: false, error: 'Не указана запись' }
  await deleteLocalWithSync('trainer_schedule_entries', pid, 'trainer_schedule_entries', { id: pid })
  dispatchLocalDataChanged({ reason: 'trainer-schedule' })
  return { ok: true }
}

/**
 * После смены клуба тренера — обновить club_id у его слотов (локально + sync).
 * @param {string} trainerId
 * @param {string | null | undefined} newClubId
 */
export async function updateTrainerScheduleClubForTrainer(trainerId, newClubId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return
  const nextClub = newClubId != null ? String(newClubId).trim() : ''
  if (!nextClub) return
  const rows = await listTrainerScheduleEntries(tid)
  for (const row of rows) {
    if (String(row.club_id ?? '') === nextClub) continue
    await saveTrainerScheduleEntry({ ...row, club_id: nextClub })
  }
}

/**
 * Убрать клиента из client_ids слотов (удаление / архив / очистка кэша).
 * @param {string} clientId
 * @param {{ sync?: boolean }} [opts] — sync=false: только IDB (после pull)
 */
export async function stripClientIdFromTrainerScheduleEntries(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return
  const withSync = opts.sync !== false
  let db
  try {
    db = await getDb()
  } catch {
    return
  }
  if (!db.objectStoreNames.contains('trainer_schedule_entries')) return
  /** @type {object[]} */
  let rows = []
  try {
    rows = await db.getAll('trainer_schedule_entries')
  } catch {
    return
  }
  for (const raw of rows) {
    const row = normalizeTrainerScheduleEntry(raw)
    if (!row) continue
    if (!row.client_ids.includes(cid)) continue
    const nextIds = row.client_ids.filter((id) => id !== cid)
    if (!nextIds.length && !String(row.title ?? '').trim()) {
      if (withSync) {
        await deleteTrainerScheduleEntry(row.id)
      } else {
        try {
          await db.delete('trainer_schedule_entries', row.id)
        } catch {
          /* ignore */
        }
      }
      continue
    }
    const next = {
      ...row,
      client_ids: nextIds,
      title: nextIds.length ? row.title : row.title || 'Заметка',
      updated_at: new Date().toISOString(),
      synced: false,
    }
    if (withSync) {
      await saveTrainerScheduleEntry(next)
    } else {
      try {
        await db.put('trainer_schedule_entries', next)
      } catch {
        /* ignore */
      }
    }
  }
  if (!withSync) dispatchLocalDataChanged({ reason: 'trainer-schedule' })
}
