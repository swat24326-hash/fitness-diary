import {
  assertSalesManagerClientInsert,
  assertSalesManagerClientUpdate,
  assertSalesManagerSameClub,
  isSalesManagerClientPushTable,
} from '../../src/lib/admin/salesManagerClientsAccessCore.js'

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

/** Админ — любые; менеджер продаж — свой клуб; тренер — только свои. */
export async function canAccessClient(ctx, clientId) {
  if (!isUuid(clientId)) return false
  if (ctx.isAdmin) return true
  const c = await getClientRow(ctx.supabaseAdmin, clientId)
  if (!c) return false
  if (ctx.isSalesManager) {
    const club = String(ctx.profile?.club_id ?? ctx.salesClubId ?? '').trim()
    return Boolean(club && String(c.club_id ?? '') === club)
  }
  if (!ctx.isTrainer) return false
  return String(c.trainer_id) === String(ctx.user.id)
}

/**
 * Менеджер продаж: только clients/memberships своего клуба (desk + lite-ПЗ + правка).
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function authorizeSalesManagerPush(ctx, table_name, operation, data, remote_id) {
  const op = String(operation ?? '')
  const payload = data ?? {}
  const profileClub = String(ctx.profile?.club_id ?? ctx.salesClubId ?? '').trim()

  if (!isSalesManagerClientPushTable(table_name)) {
    return { ok: false, error: 'Менеджер может менять только клиентов и абонементы своего клуба' }
  }

  try {
    if (table_name === 'clients') {
      const id = remote_id || payload.id
      if (op === 'insert') {
        return assertSalesManagerClientInsert(profileClub, payload)
      }
      const existing = await getClientRow(ctx.supabaseAdmin, id)
      if (!existing) return op === 'delete' ? { ok: true } : { ok: false, error: 'Клиент не найден' }
      if (op === 'delete') {
        return assertSalesManagerSameClub(profileClub, existing.club_id)
      }
      return assertSalesManagerClientUpdate(profileClub, existing.club_id, payload)
    }

    if (table_name === 'memberships') {
      if (op === 'delete') {
        const { data: m } = await ctx.supabaseAdmin
          .from('memberships')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        if (!m?.client_id) return { ok: true }
        return (await canAccessClient(ctx, m.client_id))
          ? { ok: true }
          : { ok: false, error: 'Нет доступа' }
      }
      const clientId = payload.client_id
      if (!(await canAccessClient(ctx, clientId))) {
        return { ok: false, error: 'Нет доступа к клиенту' }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
        const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
        if (!clubCheck.ok) return clubCheck
      }
      return { ok: true }
    }

    return { ok: false, error: 'Нет доступа' }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Ошибка проверки доступа' }
  }
}

/**
 * Проверка права на запись в таблицу (перед push-record).
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function authorizePush(ctx, table_name, operation, data, remote_id) {
  const { supabaseAdmin, user, isAdmin, isTrainer, isSalesManager } = ctx
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
    'client_weight_entries',
    'challenges',
    'exercises',
    'membership_types',
    'nutrition_products',
    'homework_presets',
    'pnk_funnel_events',
    'sale_clips',
  ])
  if (!allowed.has(table_name)) {
    return { ok: false, error: 'Таблица не поддерживается для синхронизации' }
  }

  if (isAdmin) return { ok: true }

  if (isSalesManager) {
    return authorizeSalesManagerPush(ctx, table_name, operation, data, remote_id)
  }

  if (
    table_name === 'membership_types' ||
    table_name === 'nutrition_products' ||
    table_name === 'homework_presets'
  ) {
    return { ok: false, error: 'Справочник может менять только администратор' }
  }

  if (!isTrainer) {
    return { ok: false, error: 'Нет доступа' }
  }

  try {
    if (table_name === 'clients') {
      const id = remote_id || payload.id
      if (op === 'insert') {
        if (!payload.trainer_id || String(payload.trainer_id) !== String(user.id)) {
          return { ok: false, error: 'Клиент должен быть закреплён за вами' }
        }
        if (payload.desk_hall === 'tz' || payload.desk_hall === 'az') {
          return { ok: false, error: 'Desk ТЗ/АЗ может создавать только администратор' }
        }
        return { ok: true }
      }
      if (!(await canAccessClient(ctx, id))) return { ok: false, error: 'Нет доступа к клиенту' }
      if (op === 'update') {
        if (Object.prototype.hasOwnProperty.call(payload, 'trainer_id')) {
          if (payload.trainer_id == null || String(payload.trainer_id) === '') {
            return { ok: false, error: 'Нельзя снять тренера с клиента' }
          }
          if (String(payload.trainer_id) !== String(user.id)) {
            return { ok: false, error: 'Нельзя переназначить клиента другому тренеру' }
          }
        }
        if (payload.desk_hall === 'tz' || payload.desk_hall === 'az') {
          return { ok: false, error: 'Desk ТЗ/АЗ может менять только администратор' }
        }
      }
      return { ok: true }
    }

    if (table_name === 'memberships') {
      const clientId = payload.client_id
      if (op === 'delete') {
        const { data: m } = await supabaseAdmin.from('memberships').select('client_id').eq('id', remote_id).maybeSingle()
        // Уже нет в облаке (удалили до insert / повтор delete) — успех, не 403.
        if (!m?.client_id) return { ok: true }
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

    if (table_name === 'client_weight_entries') {
      const clientId = payload.client_id
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin
          .from('client_weight_entries')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
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

    if (table_name === 'pnk_funnel_events') {
      if (op !== 'insert') {
        return { ok: false, error: 'Журнал ПНК можно только добавлять' }
      }
      if (String(payload.trainer_id ?? '') !== String(user.id)) {
        return { ok: false, error: 'Событие ПНК должно быть от вашего имени' }
      }
      const { data: prof } = await supabaseAdmin.from('users').select('club_id').eq('id', user.id).maybeSingle()
      if (String(prof?.club_id ?? '') !== String(payload.club_id ?? '')) {
        return { ok: false, error: 'Событие ПНК другого клуба' }
      }
      return { ok: true }
    }

    if (table_name === 'sale_clips') {
      if (op === 'delete') return { ok: false, error: 'Клип нельзя удалить с планшета' }
      if (op === 'insert') return { ok: false, error: 'Клип создаёт только менеджер/админ' }
      const id = remote_id || payload.id
      const { data: clip } = await supabaseAdmin
        .from('sale_clips')
        .select('id, trainer_id, club_id, status')
        .eq('id', id)
        .maybeSingle()
      if (!clip) return { ok: true }
      if (String(clip.trainer_id ?? '') !== String(user.id)) {
        return { ok: false, error: 'Клип другого тренера' }
      }
      return { ok: true }
    }

    return { ok: false, error: 'Нет доступа' }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Ошибка проверки доступа' }
  }
}
