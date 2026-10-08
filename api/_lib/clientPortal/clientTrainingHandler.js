/**
 * POST /api/client-me { action: 'training', id } → { training } — одна завершённая тренировка этого клиента.
 * Чужая, черновик или несуществующая — одинаковый 404, чтобы не подсказывать, что id существует.
 */
import { sendJson } from '../adminSupabase.js'
import { buildClientTrainingView, isClientTrainingId } from './clientTrainingViewCore.js'

export async function handleClientTraining(db, ctx, id, res) {
  if (!isClientTrainingId(id)) {
    sendJson(res, 400, { error: 'Неверная тренировка' })
    return
  }
  const { data: row, error } = await db
    .from('trainings')
    .select('id, date, type, data, trainer_id')
    .eq('id', id)
    .eq('client_id', ctx.clientId)
    .eq('status', 'completed')
    .maybeSingle()
  if (error) throw error
  if (!row) {
    sendJson(res, 404, { error: 'Тренировка не найдена' })
    return
  }
  let trainerName = null
  if (row.trainer_id) {
    const u = await db.from('users').select('name').eq('id', row.trainer_id).maybeSingle()
    if (u.error) throw u.error
    trainerName = String(u.data?.name ?? '').trim() || null
  }
  sendJson(res, 200, { training: buildClientTrainingView(row, trainerName) })
}
