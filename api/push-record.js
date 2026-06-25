/**
 * Одна запись из очереди синхронизации → Supabase (service role, проверка прав).
 * POST { table_name, operation, data, remote_id? }
 */
import { requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { executePushRecord } from './_lib/pushRecordCore.js'

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const ctx = await requireAuthUser(req, res)
  if (!ctx) return

  if (!ctx.isAdmin && !ctx.isTrainer) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
  }
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'Тело запроса пустое' })
    return
  }

  const table_name = String(body.table_name ?? '').trim()
  const operation = String(body.operation ?? '').trim()
  const data = body.data
  const remote_id = body.remote_id != null ? String(body.remote_id) : null

  const out = await executePushRecord(ctx, { table_name, operation, data, remote_id })
  if (out.ok) {
    sendJson(res, 200, {
      ok: true,
      duplicate: out.duplicate,
      record: out.record,
    })
    return
  }

  sendJson(res, out.status ?? 400, { error: out.error ?? 'Ошибка' })
}
