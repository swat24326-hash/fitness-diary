/**
 * Одна запись из очереди синхронизации → Supabase (service role, проверка прав).
 * POST { table_name, operation, data, remote_id? }
 */
import { requireAuthUser, sendJson, setCors } from './lib/adminSupabase.js'
import { authorizePush } from './lib/mutationAuth.js'

const ALLOWED = new Set([
  'clients',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'challenges',
  'exercises',
])

function friendlyExerciseDbError(error, operation) {
  const msg = String(error?.message ?? '')
  const code = String(error?.code ?? '')
  if (code === '23505' || /unique|duplicate/i.test(msg)) {
    return 'Упражнение с таким названием уже есть в справочнике'
  }
  if (code === '23503' || /foreign key|violates/i.test(msg)) {
    if (operation === 'delete') {
      return 'Нельзя удалить: упражнение используется в челлендже. Сначала измените или удалите челлендж.'
    }
  }
  return msg || 'Ошибка базы данных'
}

/** Перед insert: FK created_by / exercise_id / club_id — с понятными ошибками. */
async function prepareChallengePayload(supabaseAdmin, data) {
  const row = { ...(data ?? {}) }
  if (row.created_by) {
    const { data: u } = await supabaseAdmin.from('users').select('id').eq('id', row.created_by).maybeSingle()
    if (!u) row.created_by = null
  }
  const clubId = String(row.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Укажите клуб челленджа' }
  const { data: club } = await supabaseAdmin.from('clubs').select('id').eq('id', clubId).maybeSingle()
  if (!club) return { ok: false, error: 'Клуб не найден в облаке' }

  const exId = String(row.exercise_id ?? '').trim()
  if (!exId) return { ok: false, error: 'Укажите упражнение' }
  const { data: ex } = await supabaseAdmin.from('exercises').select('id').eq('id', exId).maybeSingle()
  if (!ex) {
    return {
      ok: false,
      error:
        'Упражнение не найдено в облаке. В админке: Sync в шапке (подтянуть упражнения), затем создайте челлендж снова или нажмите Sync.',
    }
  }
  return { ok: true, data: row }
}

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

  if (!ALLOWED.has(table_name)) {
    sendJson(res, 400, { error: 'Таблица не поддерживается' })
    return
  }

  const authz = await authorizePush(ctx, table_name, operation, data, remote_id)
  if (!authz.ok) {
    sendJson(res, 403, { error: authz.error })
    return
  }

  const { supabaseAdmin } = ctx

  try {
    if (operation === 'insert') {
      let payload = data
      if (table_name === 'challenges') {
        const prep = await prepareChallengePayload(supabaseAdmin, data)
        if (!prep.ok) {
          sendJson(res, 400, { error: prep.error })
          return
        }
        payload = prep.data
      }
      const { error } = await supabaseAdmin.from(table_name).insert(payload)
      if (error) {
        if (error.code === '23505') {
          if (table_name === 'exercises' && payload?.name) {
            const { data: existing } = await supabaseAdmin
              .from('exercises')
              .select('*')
              .eq('name', payload.name)
              .maybeSingle()
            if (existing) {
              sendJson(res, 200, { ok: true, duplicate: true, record: existing })
              return
            }
          }
          if (payload?.id) {
            const { data: existingById } = await supabaseAdmin
              .from(table_name)
              .select('*')
              .eq('id', payload.id)
              .maybeSingle()
            if (existingById) {
              sendJson(res, 200, { ok: true, duplicate: true, record: existingById })
              return
            }
          }
          sendJson(res, 200, { ok: true, duplicate: true })
          return
        }
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'insert') : error.message
        sendJson(res, 400, { error: errMsg })
        return
      }
      sendJson(res, 200, { ok: true })
      return
    }

    if (operation === 'update' && remote_id) {
      const { error } = await supabaseAdmin.from(table_name).update(data).eq('id', remote_id)
      if (error) {
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'update') : error.message
        sendJson(res, 400, { error: errMsg })
        return
      }
      sendJson(res, 200, { ok: true })
      return
    }

    if (operation === 'delete' && remote_id) {
      if (table_name === 'health_cards') {
        const { error } = await supabaseAdmin.from(table_name).delete().eq('id', remote_id)
        if (error) {
          sendJson(res, 400, { error: error.message })
          return
        }
      } else {
        const { error } = await supabaseAdmin.from(table_name).delete().eq('id', remote_id)
        if (error) {
          const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'delete') : error.message
          sendJson(res, 400, { error: errMsg })
          return
        }
      }
      sendJson(res, 200, { ok: true })
      return
    }

    sendJson(res, 400, { error: 'Некорректные operation / remote_id' })
  } catch (e) {
    sendJson(res, 500, { error: e?.message ? String(e.message) : 'Server error' })
  }
}
