/**
 * Пакетная отправка очереди синхронизации → Supabase.
 * POST { records: [{ table_name, operation, data, remote_id?, local_id? }] }
 */
import { requireAuthUser, sendJson, setCors } from './lib/adminSupabase.js'
import { executePushRecord } from './lib/pushRecordCore.js'
import { runPool } from './lib/runPool.js'

const MAX_BATCH = 50
/** Параллельные записи в одном запросе (укладываемся в лимит времени serverless). */
const POOL = 8

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

  const records = Array.isArray(body.records) ? body.records : null
  if (!records || records.length === 0) {
    sendJson(res, 400, { error: 'records: ожидается непустой массив' })
    return
  }
  if (records.length > MAX_BATCH) {
    sendJson(res, 400, { error: `Не более ${MAX_BATCH} записей за запрос` })
    return
  }

  const results = await runPool(records, POOL, async (rec, index) => {
    const row = rec ?? {}
    const table_name = String(row.table_name ?? '').trim()
    const operation = String(row.operation ?? '').trim()
    const data = row.data
    const remote_id = row.remote_id != null ? String(row.remote_id) : null
    const local_id = row.local_id != null ? String(row.local_id) : null

    const out = await executePushRecord(ctx, { table_name, operation, data, remote_id })
    return {
      index,
      local_id,
      ok: out.ok,
      duplicate: !!out.duplicate,
      record: out.record,
      error: out.error,
      status: out.status,
    }
  })

  const allOk = results.every((r) => r.ok)
  sendJson(res, allOk ? 200 : 207, { ok: allOk, results })
}
