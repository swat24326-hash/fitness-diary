import { sendJson } from '../adminSupabase.js'
import { loadHomeworkLibraryRows } from './homeworkLibraryRows.js'

/** GET admin-data?action=homework-library — правки библиотеки ДЗ сети (читают админ и тренеры). */
export async function handleHomeworkLibraryGet(authCtx, res) {
  if (!authCtx.isAdmin && !authCtx.isTrainer) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }
  const rows = await loadHomeworkLibraryRows(authCtx.supabaseAdmin)
  sendJson(res, 200, { rows, count: rows.length })
}
