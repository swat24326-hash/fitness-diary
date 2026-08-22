import {
  assertSalesManagerClientInsert,
  assertSalesManagerClientUpdate,
  assertSalesManagerDeskClientDelete,
  assertSalesManagerSameClub,
  isSalesManagerClientPushTable,
  isSalesManagerDeskDeleteExtraTable,
} from '../../src/lib/admin/salesManagerClientsAccessCore.js'
import { isSupervisorDeniedPushTable } from '../../src/lib/admin/supervisorAccessCore.js'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

export function isUuid(v) {
  return UUID_RE.test(String(v ?? '').trim())
}

async function getClientRow(supabaseAdmin, clientId) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, trainer_id, club_id, desk_hall')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Контекст для desk-only delete: абоны + lifecycle ПЗ. */
async function getClientManagerDeleteCtx(supabaseAdmin, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return { memberships: [], lifecycleRows: [] }
  const [memRes, lifeRes] = await Promise.all([
    supabaseAdmin
      .from('memberships')
      .select(
        'id, client_id, hall, start_date, end_date, total_trainings, used_trainings, membership_type_id, is_pnk',
      )
      .eq('client_id', id),
    supabaseAdmin
      .from('client_hall_lifecycle')
      .select('id, client_id, club_id, hall, closed_at')
      .eq('client_id', id),
  ])
  if (memRes.error) throw memRes.error
  if (lifeRes.error) throw lifeRes.error
  return {
    memberships: Array.isArray(memRes.data) ? memRes.data : [],
    lifecycleRows: Array.isArray(lifeRes.data) ? lifeRes.data : [],
  }
}

/** Запрет подмены client_id в payload при update чужой/своей строки. */
function assertPayloadClientMatchesExisting(payload, existingClientId) {
  if (
    payload &&
    Object.prototype.hasOwnProperty.call(payload, 'client_id') &&
    payload.client_id != null &&
    String(payload.client_id) !== '' &&
    String(payload.client_id) !== String(existingClientId ?? '')
  ) {
    return { ok: false, error: 'Нельзя переназначить запись другому клиенту' }
  }
  return { ok: true }
}

async function getMembershipExistingClientId(supabaseAdmin, remote_id) {
  if (!remote_id) return null
  const { data } = await supabaseAdmin.from('memberships').select('client_id').eq('id', remote_id).maybeSingle()
  return data?.client_id ?? null
}

/**
 * client_id владельца строки для update/delete.
 * health_cards: remote_id может быть id строки или client_id (ключ IDB).
 */
async function resolveRowClientId(supabaseAdmin, table_name, remote_id, payloadClientId) {
  if (remote_id) {
    const { data: byId } = await supabaseAdmin.from(table_name).select('client_id').eq('id', remote_id).maybeSingle()
    if (byId?.client_id) return byId.client_id
    if (table_name === 'health_cards') {
      const { data: byCid } = await supabaseAdmin
        .from(table_name)
        .select('client_id')
        .eq('client_id', remote_id)
        .maybeSingle()
      if (byCid?.client_id) return byCid.client_id
    }
  }
  return payloadClientId ?? null
}


/** Админ — любые; управляющий / менеджер — свой клуб; тренер — только свои. */
export async function canAccessClient(ctx, clientId) {
  if (!isUuid(clientId)) return false
  if (ctx.isAdmin) return true
  const c = await getClientRow(ctx.supabaseAdmin, clientId)
  if (!c) return false
  if (ctx.isSupervisor || ctx.isSalesManager) {
    const club = String(ctx.profile?.club_id ?? ctx.supervisorClubId ?? ctx.salesClubId ?? '').trim()
    return Boolean(club && String(c.club_id ?? '') === club)
  }
  if (!ctx.isTrainer) return false
  return String(c.trainer_id) === String(ctx.user.id)
}

/**
 * Менеджер продаж: clients/memberships своего клуба; удаление desk ТЗ/АЗ + каскад.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function authorizeSalesManagerPush(ctx, table_name, operation, data, remote_id) {
  const op = String(operation ?? '')
  const payload = data ?? {}
  const profileClub = String(ctx.profile?.club_id ?? ctx.salesClubId ?? '').trim()

  if (!isSalesManagerClientPushTable(table_name) && !(op === 'delete' && isSalesManagerDeskDeleteExtraTable(table_name))) {
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
        const delCtx = await getClientManagerDeleteCtx(ctx.supabaseAdmin, id)
        return assertSalesManagerDeskClientDelete(profileClub, existing, delCtx)
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
      if (op === 'update') {
        const existingClientId = await getMembershipExistingClientId(ctx.supabaseAdmin, remote_id)
        if (!existingClientId) return { ok: false, error: 'Абонемент не найден' }
        if (!(await canAccessClient(ctx, existingClientId))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        const reassign = assertPayloadClientMatchesExisting(payload, existingClientId)
        if (!reassign.ok) return reassign
        if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
          const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
          if (!clubCheck.ok) return clubCheck
        }
        return { ok: true }
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

    if (table_name === 'client_hall_lifecycle') {
      if (op === 'delete') {
        const { data: row } = await ctx.supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: true }
        return (await canAccessClient(ctx, row.client_id))
          ? { ok: true }
          : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update') {
        const { data: row } = await ctx.supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        const existingClientId = row?.client_id
        if (!existingClientId) return { ok: false, error: 'Запись направления не найдена' }
        if (!(await canAccessClient(ctx, existingClientId))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        const reassign = assertPayloadClientMatchesExisting(payload, existingClientId)
        if (!reassign.ok) return reassign
        if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
          const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
          if (!clubCheck.ok) return clubCheck
        }
        return { ok: true }
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

    if (op === 'delete' && isSalesManagerDeskDeleteExtraTable(table_name)) {
      let clientId = payload.client_id
      if (!clientId && remote_id) {
        const { data: row } = await ctx.supabaseAdmin
          .from(table_name)
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: true }
        clientId = row.client_id
      }
      const existing = await getClientRow(ctx.supabaseAdmin, clientId)
      if (!existing) return { ok: true }
      const delCtx = await getClientManagerDeleteCtx(ctx.supabaseAdmin, clientId)
      return assertSalesManagerDeskClientDelete(profileClub, existing, delCtx)
    }

    return { ok: false, error: 'Нет доступа' }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Ошибка проверки доступа' }
  }
}

/**
 * Управляющий: почти админ клуба; справочники сети и создание тренировок — нет.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function authorizeSupervisorPush(ctx, table_name, operation, data, remote_id) {
  const op = String(operation ?? '')
  const payload = data ?? {}
  const profileClub = String(ctx.profile?.club_id ?? ctx.supervisorClubId ?? '').trim()
  const { supabaseAdmin } = ctx

  if (!profileClub) {
    return { ok: false, error: 'У управляющего не задан club_id' }
  }
  if (isSupervisorDeniedPushTable(table_name)) {
    return { ok: false, error: 'Справочник может менять только администратор сети' }
  }

  try {
    if (table_name === 'clients') {
      const id = remote_id || payload.id
      if (op === 'insert') {
        const clubId = payload.club_id != null && payload.club_id !== '' ? payload.club_id : profileClub
        const clubCheck = assertSalesManagerSameClub(profileClub, clubId)
        if (!clubCheck.ok) return clubCheck
        return { ok: true }
      }
      const existing = await getClientRow(supabaseAdmin, id)
      if (!existing) return op === 'delete' ? { ok: true } : { ok: false, error: 'Клиент не найден' }
      if (String(existing.club_id ?? '') !== profileClub) {
        return { ok: false, error: 'Нет доступа к клиенту другого клуба' }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
        const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
        if (!clubCheck.ok) return clubCheck
      }
      return { ok: true }
    }

    if (table_name === 'memberships') {
      if (op === 'delete') {
        const { data: m } = await supabaseAdmin.from('memberships').select('client_id').eq('id', remote_id).maybeSingle()
        if (!m?.client_id) return { ok: true }
        return (await canAccessClient(ctx, m.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update') {
        const existingClientId = await getMembershipExistingClientId(supabaseAdmin, remote_id)
        if (!existingClientId) return { ok: false, error: 'Абонемент не найден' }
        if (!(await canAccessClient(ctx, existingClientId))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        const reassign = assertPayloadClientMatchesExisting(payload, existingClientId)
        if (!reassign.ok) return reassign
        if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
          const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
          if (!clubCheck.ok) return clubCheck
        }
        return { ok: true }
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

    if (table_name === 'client_hall_lifecycle') {
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: true }
        return (await canAccessClient(ctx, row.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update') {
        const { data: row } = await supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: false, error: 'Запись направления не найдена' }
        if (!(await canAccessClient(ctx, row.client_id))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        const reassign = assertPayloadClientMatchesExisting(payload, row.client_id)
        if (!reassign.ok) return reassign
        if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
          const clubCheck = assertSalesManagerSameClub(profileClub, payload.club_id)
          if (!clubCheck.ok) return clubCheck
        }
        return { ok: true }
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

    if (table_name === 'trainings') {
      if (op === 'insert') {
        return { ok: false, error: 'Управляющий не проводит тренировки в этой учётке — нужен профиль тренера' }
      }
      const tid = remote_id || payload.id
      const { data: t } = await supabaseAdmin
        .from('trainings')
        .select('id, client_id, club_id, trainer_id')
        .eq('id', tid)
        .maybeSingle()
      if (!t) return op === 'delete' ? { ok: true } : { ok: false, error: 'Тренировка не найдена' }
      if (t.client_id && (await canAccessClient(ctx, t.client_id))) return { ok: true }
      if (t.club_id && String(t.club_id) === profileClub) return { ok: true }
      return { ok: false, error: 'Нет доступа к тренировке другого клуба' }
    }

    if (
      table_name === 'health_cards' ||
      table_name === 'body_measurements' ||
      table_name === 'client_weight_entries'
    ) {
      if (op === 'delete' && remote_id) {
        const clientId = await resolveRowClientId(supabaseAdmin, table_name, remote_id, payload.client_id)
        if (!clientId) return { ok: true }
        return (await canAccessClient(ctx, clientId)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update' && remote_id) {
        const existingClientId = await resolveRowClientId(supabaseAdmin, table_name, remote_id, null)
        if (!existingClientId) return { ok: false, error: 'Запись не найдена' }
        if (!(await canAccessClient(ctx, existingClientId))) {
          return { ok: false, error: 'Нет доступа' }
        }
        return assertPayloadClientMatchesExisting(payload, existingClientId)
      }
      const clientId = payload.client_id
      return (await canAccessClient(ctx, clientId)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
    }

    if (table_name === 'challenges') {
      let challengeClubId = payload.club_id
      if (op === 'delete' || (op === 'update' && remote_id)) {
        const { data: ch } = await supabaseAdmin.from('challenges').select('club_id').eq('id', remote_id).maybeSingle()
        if (op === 'delete' && !ch) return { ok: true }
        if (ch) challengeClubId = ch.club_id
      }
      if (String(challengeClubId ?? '') === profileClub) return { ok: true }
      return { ok: false, error: 'Челлендж другого клуба' }
    }

    if (table_name === 'pnk_funnel_events' || table_name === 'sale_clips') {
      const rowClub = payload.club_id
      if (op === 'delete' && remote_id && !rowClub) {
        const { data: row } = await supabaseAdmin.from(table_name).select('club_id').eq('id', remote_id).maybeSingle()
        if (!row) return { ok: true }
        return String(row.club_id ?? '') === profileClub
          ? { ok: true }
          : { ok: false, error: 'Нет доступа' }
      }
      // Свой club_id обязателен: нельзя «приклеить» событие к чужому клубу через client_id.
      if (String(rowClub ?? '') === profileClub) {
        if (payload.client_id && !(await canAccessClient(ctx, payload.client_id))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        return { ok: true }
      }
      if (!rowClub && payload.client_id && (await canAccessClient(ctx, payload.client_id))) {
        return { ok: true }
      }
      return { ok: false, error: 'Нет доступа' }
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
  const { supabaseAdmin, user, isAdmin, isTrainer, isSalesManager, isSupervisor } = ctx
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
    'client_hall_lifecycle',
  ])
  if (!allowed.has(table_name)) {
    return { ok: false, error: 'Таблица не поддерживается для синхронизации' }
  }

  if (isAdmin) return { ok: true }

  if (isSupervisor) {
    return authorizeSupervisorPush(ctx, table_name, operation, data, remote_id)
  }

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
        if (Object.prototype.hasOwnProperty.call(payload, 'club_id')) {
          const existing = await getClientRow(ctx.supabaseAdmin, id)
          if (existing && String(payload.club_id ?? '') !== String(existing.club_id ?? '')) {
            return { ok: false, error: 'Нельзя сменить клуб клиента' }
          }
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
      if (op === 'update') {
        const existingClientId = await getMembershipExistingClientId(supabaseAdmin, remote_id)
        if (!existingClientId) return { ok: false, error: 'Абонемент не найден' }
        if (!(await canAccessClient(ctx, existingClientId))) return { ok: false, error: 'Нет доступа к клиенту' }
        const reassign = assertPayloadClientMatchesExisting(payload, existingClientId)
        if (!reassign.ok) return reassign
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

    if (table_name === 'client_hall_lifecycle') {
      const hall = String(payload.hall ?? '').trim().toLowerCase()
      if (op === 'insert' || op === 'update') {
        if (hall && hall !== 'pz') {
          return { ok: false, error: 'Тренер может закрывать только направление ПЗ' }
        }
      }
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id, hall')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: true }
        if (String(row.hall ?? '') !== 'pz') {
          return { ok: false, error: 'Тренер может менять только направление ПЗ' }
        }
        return (await canAccessClient(ctx, row.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update') {
        const { data: row } = await supabaseAdmin
          .from('client_hall_lifecycle')
          .select('client_id, hall')
          .eq('id', remote_id)
          .maybeSingle()
        if (!row?.client_id) return { ok: false, error: 'Запись направления не найдена' }
        if (String(row.hall ?? '') !== 'pz') {
          return { ok: false, error: 'Тренер может менять только направление ПЗ' }
        }
        if (!(await canAccessClient(ctx, row.client_id))) {
          return { ok: false, error: 'Нет доступа к клиенту' }
        }
        return assertPayloadClientMatchesExisting(payload, row.client_id)
      }
      if (!(await canAccessClient(ctx, payload.client_id))) {
        return { ok: false, error: 'Нет доступа к клиенту' }
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
      if (op === 'update') {
        if (
          Object.prototype.hasOwnProperty.call(payload, 'trainer_id') &&
          payload.trainer_id != null &&
          String(payload.trainer_id) !== '' &&
          String(payload.trainer_id) !== String(t.trainer_id)
        ) {
          return { ok: false, error: 'Нельзя сменить тренера тренировки' }
        }
        const reassign = assertPayloadClientMatchesExisting(payload, t.client_id)
        if (!reassign.ok) return reassign
      }
      return { ok: true }
    }

    if (table_name === 'health_cards') {
      if (op === 'delete' && remote_id) {
        const cid = await resolveRowClientId(supabaseAdmin, 'health_cards', remote_id, payload.client_id)
        return (await canAccessClient(ctx, cid)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update' && remote_id) {
        const existingClientId = await resolveRowClientId(supabaseAdmin, 'health_cards', remote_id, null)
        if (!existingClientId) return { ok: false, error: 'Запись не найдена' }
        if (!(await canAccessClient(ctx, existingClientId))) return { ok: false, error: 'Нет доступа к клиенту' }
        return assertPayloadClientMatchesExisting(payload, existingClientId)
      }
      const clientId = payload.client_id
      if (!(await canAccessClient(ctx, clientId))) return { ok: false, error: 'Нет доступа к клиенту' }
      return { ok: true }
    }

    if (table_name === 'body_measurements') {
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin.from('body_measurements').select('client_id').eq('id', remote_id).maybeSingle()
        return (await canAccessClient(ctx, row?.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update' && remote_id) {
        const existingClientId = await resolveRowClientId(supabaseAdmin, 'body_measurements', remote_id, null)
        if (!existingClientId) return { ok: false, error: 'Запись не найдена' }
        if (!(await canAccessClient(ctx, existingClientId))) return { ok: false, error: 'Нет доступа к клиенту' }
        return assertPayloadClientMatchesExisting(payload, existingClientId)
      }
      const clientId = payload.client_id
      if (!(await canAccessClient(ctx, clientId))) return { ok: false, error: 'Нет доступа к клиенту' }
      return { ok: true }
    }

    if (table_name === 'client_weight_entries') {
      if (op === 'delete') {
        const { data: row } = await supabaseAdmin
          .from('client_weight_entries')
          .select('client_id')
          .eq('id', remote_id)
          .maybeSingle()
        return (await canAccessClient(ctx, row?.client_id)) ? { ok: true } : { ok: false, error: 'Нет доступа' }
      }
      if (op === 'update' && remote_id) {
        const existingClientId = await resolveRowClientId(supabaseAdmin, 'client_weight_entries', remote_id, null)
        if (!existingClientId) return { ok: false, error: 'Запись не найдена' }
        if (!(await canAccessClient(ctx, existingClientId))) return { ok: false, error: 'Нет доступа к клиенту' }
        return assertPayloadClientMatchesExisting(payload, existingClientId)
      }
      const clientId = payload.client_id
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
