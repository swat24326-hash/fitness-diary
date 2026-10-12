/**
 * Отправка задания / рациона в приложение клиента с планшета: IndexedDB + очередь sync.
 * Без сети запись ждёт в очереди и уходит сама — тренеру не нужно повторять.
 */
import { getDb } from '../localDb'
import { saveLocalWithSync } from '../syncService'

/** @param {{ kind: 'homework'|'nutrition', client: object, payload: object, userId: string }} p */
export async function sendClientPlanToApp({ kind, client, payload, userId }) {
  const row = {
    id: crypto.randomUUID(),
    client_id: String(client.id),
    club_id: client.club_id ?? null,
    kind,
    payload,
    sent_by: String(userId),
    sent_at: new Date().toISOString(),
    client_seen_at: null,
  }
  await saveLocalWithSync('client_plans', row, { table_name: 'client_plans', operation: 'insert', remote_id: null })
  return row
}

/** Последняя отправка этого вида клиенту (своя локальная или отметка из trainer-pull). */
export async function latestClientPlanMark(clientId, kind) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return null
  const db = await getDb()
  const list = (await db.getAllFromIndex('client_plans', 'by_client_id', cid)).filter((r) => r.kind === kind)
  list.sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')))
  return list[0] ?? null
}
