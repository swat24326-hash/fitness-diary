/**
 * Настройки авто-ДЗ клиента на планшете: IndexedDB + очередь sync (офлайн — уйдёт, когда появится связь).
 */
import { getDb } from '../../localDb'
import { saveLocalWithSync } from '../../syncService'
import { dispatchLocalDataChanged } from '../../localDataEvents.js'
import { homeworkAutoRowId, normalizeHomeworkAutoRow } from './homeworkAutoScheduleCore.js'

export async function loadHomeworkAuto(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return null
  try {
    const db = await getDb()
    return (await db.get('homework_auto', homeworkAutoRowId(cid))) ?? null
  } catch {
    return null
  }
}

/** @param {{ client: object, userId: string, prev: object|null, patch: object }} p */
export async function saveHomeworkAuto({ client, userId, prev, patch }) {
  const id = homeworkAutoRowId(client.id)
  const prep = normalizeHomeworkAutoRow({
    ...prev,
    ...patch,
    id,
    client_id: String(client.id),
    club_id: client.club_id ?? null,
    updated_by: String(userId ?? ''),
    updated_at: new Date().toISOString(),
  })
  if (!prep.ok) throw new Error(prep.error)
  await saveLocalWithSync('homework_auto', prep.data, {
    table_name: 'homework_auto',
    operation: prev ? 'update' : 'insert',
    remote_id: prev ? id : null,
  })
  dispatchLocalDataChanged({ reason: 'homework-auto', client_id: String(client.id), table_name: 'homework_auto' })
  return prep.data
}

/** Тренер поправил предпросмотр и отправил сам — в это воскресенье автоматическое не уходит. */
export async function skipHomeworkAutoSunday({ client, userId, sundayIso }) {
  const prev = await loadHomeworkAuto(client?.id)
  if (!prev?.enabled || prev.skip_date === sundayIso) return prev
  return saveHomeworkAuto({ client, userId, prev, patch: { skip_date: sundayIso } })
}
