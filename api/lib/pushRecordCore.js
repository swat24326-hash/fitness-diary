/**
 * Одна запись очереди → Supabase (используется push-record и push-records).
 */
import { authorizePush } from './mutationAuth.js'

export const PUSH_ALLOWED_TABLES = new Set([
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

/**
 * @param {object} ctx — requireAuthUser result
 * @param {{ table_name: string, operation: string, data: object, remote_id?: string | null }} item
 * @returns {Promise<{ ok: boolean, status?: number, error?: string, duplicate?: boolean, record?: object }>}
 */
export async function executePushRecord(ctx, item) {
  const table_name = String(item.table_name ?? '').trim()
  const operation = String(item.operation ?? '').trim()
  const data = item.data
  const remote_id = item.remote_id != null ? String(item.remote_id) : null

  if (!PUSH_ALLOWED_TABLES.has(table_name)) {
    return { ok: false, status: 400, error: 'Таблица не поддерживается' }
  }

  const authz = await authorizePush(ctx, table_name, operation, data, remote_id)
  if (!authz.ok) {
    return { ok: false, status: 403, error: authz.error }
  }

  const { supabaseAdmin } = ctx

  try {
    if (operation === 'insert') {
      let payload = data
      if (table_name === 'challenges') {
        const prep = await prepareChallengePayload(supabaseAdmin, data)
        if (!prep.ok) {
          return { ok: false, status: 400, error: prep.error }
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
              return { ok: true, duplicate: true, record: existing }
            }
          }
          if (payload?.id) {
            const { data: existingById } = await supabaseAdmin
              .from(table_name)
              .select('*')
              .eq('id', payload.id)
              .maybeSingle()
            if (existingById) {
              return { ok: true, duplicate: true, record: existingById }
            }
          }
          return { ok: true, duplicate: true }
        }
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'insert') : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      return { ok: true }
    }

    if (operation === 'update' && remote_id) {
      const { error } = await supabaseAdmin.from(table_name).update(data).eq('id', remote_id)
      if (error) {
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'update') : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      return { ok: true }
    }

    if (operation === 'delete' && remote_id) {
      const { error } = await supabaseAdmin.from(table_name).delete().eq('id', remote_id)
      if (error) {
        const errMsg = table_name === 'exercises' ? friendlyExerciseDbError(error, 'delete') : error.message
        return { ok: false, status: 400, error: errMsg }
      }
      return { ok: true }
    }

    return { ok: false, status: 400, error: 'Некорректные operation / remote_id' }
  } catch (e) {
    return { ok: false, status: 500, error: e?.message ? String(e.message) : 'Server error' }
  }
}
