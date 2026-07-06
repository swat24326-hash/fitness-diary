const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

export function isUuid(v) {
  return UUID_RE.test(String(v ?? '').trim())
}

async function getClientRow(supabaseAdmin, clientId) {
  const { data, error } = await supabaseAdmin.from('clients').select('id, trainer_id, club_id').eq('id', clientId).maybeSingle()
  if (error) throw error
  return data
}

/** Тренер — только свои клиенты; админ — любые. */
export async function canAccessClient(ctx, clientId) {
  if (!isUuid(clientId)) return false
  if (ctx.isAdmin) return true
  if (!ctx.isTrainer) return false
  const c = await getClientRow(ctx.supabaseAdmin, clientId)
  return c && String(c.trainer_id) === String(ctx.user.id)
}

/**
 * Проверка права на запись в таблицу (перед push-record).
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function authorizePush(ctx, table_name, operation, data, remote_id) {
  const { supabaseAdmin, user, isAdmin, isTrainer } = ctx
  const op = String(operation ?? '')
  const payload = data ?? {}

  if (!['insert', 'update', 'delete'].includes(op)) {
    return { ok: false, error: 'Недопустимая операция' }
  }

  const allowed = new Set([
    'clients',
    'memberships',
    'trainings',
    'health_cards',
    'body_measurements',
    'challenges',
    'exercises',
    'membership_types',
  ])
  if (!allowed.has(table_name)) {
    return { ok: false, error: 'Таблица не поддерживается для синхронизации' }
  }

  if (isAdmin) return { ok: true }

  if (table_name === 'membership_types') {
    return { ok: false, error: 'Типы абонементов может менять только администратор' }
  }

  if (!isTrainer) {
    return { ok: false, error: 'Нет доступа' }
  }

  try {
    if (table_name === 'clients') {
      const id = remote_id || payload.id
      if (op === 'insert') {
        if (String(payload.trainer_id) !== String(user.id)) {
          return { ok: false, error: 'Клиент должен быть закреплён за вами' }
        }
        return { ok: true }
      }
      if (!(await canAccessClient(ctx, id))) return { ok: false, error: 'Нет доступа к клиенту' }
      if (op === 'update' && payload.trainer_id != null && String(payload.trainer_id) !== String(user.id)) {
        return { ok: false, error: 'Нельзя переназначить клиента другому тренеру' }
      }
      return { ok: true }
    }

    if (table_name === 'memberships') {
      const clientId = payload.client_id
      if (op === 'delete') {
        const { data: m } = await supabaseAdmin.from('memberships').select('client_id').eq('id', remote_id).maybeSingle()
        if (!m?.client_id) return { ok: false, error: 'Абонемент не найден' }
        return (await canAccessClient(ctx, m.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (!(await canAccessClient(ctx, clientId))) return { ok: false, error: 'Нет доступа к клиенту' }
      const typeId = payload.membership_type_id
      if (typeId) {
        const { data: mt } = await supabaseAdmin
          .from('membership_types')
          .select('trainer_assignable')
          .eq('id', typeId)
          .maybeSingle()
        if (mt?.trainer_assignable === false) {
          return { ok: false, error: 'Этот тип абонемента недоступен для оформления тренером' }
        }
      }
      return { ok: true }
    }

    if (table_name === 'trainings') {
      if (op === 'insert') {
        if (String(payload.trainer_id) !== String(user.id)) {
          return { ok: false, error: 'Тренировка должна быть вашей' }
        }
        if (payload.client_id && !(await canAccessClient(ctx, payload.client_id))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        return { ok: true }
      }
      const tid = remote_id || payload.id
      const { data: t } = await supabaseAdmin.from('trainings').select('trainer_id, client_id').eq('id', tid).maybeSingle()
      if (!t) return op === 'delete' ? { ok: true } : { ok: false, error: 'Тренировка не найдена' }
      if (String(t.trainer_id) !== String(user.id)) return { ok: false, error: 'Нет доступа' }
      return { ok: true }
    }

    if (table_name === 'health_cards') {
      const clientId = payload.client_id
      if (op === 'delete' && remote_id) {
        const { data: h } = await supabaseAdmin.from('health_cards').select('client_id').eq('id', remote_id).maybeSingle()
        const cid = h?.client_id ?? clientId
        return (await canAccessClient(ctx, cid)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (!(await canAccessClient(ctx, clientId))) return { ok: false, error: 'Нет доступа к клиенту' }
      return { ok: true }
    }

    if (table_name === 'body_measurements') {
      const clientId = payload.client_id
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin.from('body_measurements').select('client_id').eq('id', remote_id).maybeSingle()
        return (await canAccessClient(ctx, row?.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (!(await canAccessClient(ctx, clientId))) return { ok: false, error: 'Нет доступа к клиенту' }
      return { ok: true }
    }

    if (table_name === 'challenges') {
      let challengeClubId = payload.club_id
      if (op === 'delete') {
        const { data: ch } = await supabaseAdmin.from('challenges').select('club_id').eq('id', remote_id).maybeSingle()
        if (!ch) return { ok: true }
        challengeClubId = ch.club_id
      }
      const { data: prof } = await supabaseAdmin.from('users').select('club_id').eq('id', user.id).maybeSingle()
      if (String(prof?.club_id ?? '') === String(challengeClubId ?? '')) return { ok: true }
      return { ok: false, error: 'Челлендж другого клуба' }
    }

    return { ok: false, error: 'Нет доступа' }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Ошибка проверки доступа' }
  }
}
