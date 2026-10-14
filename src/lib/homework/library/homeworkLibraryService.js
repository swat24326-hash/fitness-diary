/**
 * Библиотека ДЗ сети: правки админа в IndexedDB + очередь sync. Тренер получает их через trainer-pull.
 */
import { getDb, buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from '../../localDb'
import { saveLocalWithSync } from '../../syncService'
import { dispatchLocalDataChanged } from '../../localDataEvents.js'
import { fetchHomeworkLibraryViaApi } from '../../admin/adminApiClient.js'
import { normalizeHomeworkLibraryRow } from './homeworkLibraryOverridesCore.js'

export const HOMEWORK_LIBRARY_EVENT_REASON = 'homework-library'

export async function listHomeworkLibraryRows() {
  try {
    const db = await getDb()
    return await db.getAll('homework_library')
  } catch {
    return []
  }
}

/** Сохранить упражнение (новое, правка встроенного, убрать/вернуть через is_active). */
export async function saveHomeworkLibraryEntry({ entry, isActive = true, userId }) {
  const prep = normalizeHomeworkLibraryRow({
    id: entry?.id,
    entry,
    is_active: isActive,
    updated_by: String(userId ?? ''),
    updated_at: new Date().toISOString(),
  })
  if (!prep.ok) throw new Error(prep.error)
  const db = await getDb()
  const prev = await db.get('homework_library', prep.data.id)
  await saveLocalWithSync('homework_library', prep.data, {
    table_name: 'homework_library',
    operation: prev ? 'update' : 'insert',
    remote_id: prev ? prep.data.id : null,
  })
  dispatchLocalDataChanged({ reason: HOMEWORK_LIBRARY_EVENT_REASON, table_name: 'homework_library' })
  return prep.data
}

/** Свежие правки с сервера в кэш; неотправленные локальные не затираются. */
export async function pullHomeworkLibrary() {
  const rows = await fetchHomeworkLibraryViaApi()
  if (!rows) return { count: 0 }
  const pending = await buildPendingSyncKeysByTable()
  for (const row of rows) await putStoreUnlessPendingSync('homework_library', row, pending)
  dispatchLocalDataChanged({ reason: HOMEWORK_LIBRARY_EVENT_REASON, table_name: 'homework_library' })
  return { count: rows.length }
}
