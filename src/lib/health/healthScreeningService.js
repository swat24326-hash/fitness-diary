/**
 * Анкета здоровья на планшете: IndexedDB + очередь sync (офлайн — уйдёт, когда появится связь).
 */
import { getDb } from '../localDb'
import { saveLocalWithSync } from '../syncService'
import { dispatchLocalDataChanged } from '../localDataEvents.js'
import { healthScreeningRowId, normalizeHealthScreeningRow } from './healthScreeningCore.js'

export async function loadHealthScreening(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return null
  try {
    const db = await getDb()
    return (await db.get('health_screenings', healthScreeningRowId(cid))) ?? null
  } catch {
    return null
  }
}

/** @param {{ client: object, userId: string, prev: object|null, answers: object }} p */
export async function saveHealthScreening({ client, userId, prev, answers }) {
  const id = healthScreeningRowId(client.id)
  const prep = normalizeHealthScreeningRow({
    id,
    client_id: String(client.id),
    club_id: client.club_id ?? null,
    answers,
    updated_by: String(userId ?? ''),
    updated_at: new Date().toISOString(),
  })
  if (!prep.ok) throw new Error(prep.error)
  await saveLocalWithSync('health_screenings', prep.data, {
    table_name: 'health_screenings',
    operation: prev ? 'update' : 'insert',
    remote_id: prev ? id : null,
  })
  dispatchLocalDataChanged({ reason: 'health-screening', client_id: String(client.id), table_name: 'health_screenings' })
  return prep.data
}
