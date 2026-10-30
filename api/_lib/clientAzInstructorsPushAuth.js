/**
 * Серверная проверка push client_az_instructors.
 */

import { USERS_TRAINER_ROLES } from '../../src/lib/userRoleConstants.js'
import { assertClientAzInstructorsPushRole } from '../../src/lib/admin/clientAzInstructorsPushAuthCore.js'
import { isAerobicSalesMembershipType } from '../../src/lib/membershipTypesCore.js'
import { assertSalesManagerSameClub } from '../../src/lib/admin/salesManagerClientsAccessCore.js'
import { isClientAzInstructorUuid } from '../../src/lib/admin/clientAzInstructorsCore.js'

/**
 * @param {object} ctx — authorizePush ctx
 * @param {string} op
 * @param {object} payload
 * @param {string|null} remote_id
 * @param {(ctx: object, clientId: string) => Promise<boolean>} canAccessClient
 */
export async function authorizeClientAzInstructorsPush(ctx, op, payload, remote_id, canAccessClient) {
  const roleGate = assertClientAzInstructorsPushRole({
    op,
    isAdmin: ctx.isAdmin,
    isSalesManager: ctx.isSalesManager,
    isSupervisor: ctx.isSupervisor,
    isTrainer: ctx.isTrainer,
    payload,
  })
  if (!roleGate.ok) return roleGate

  const supabaseAdmin = ctx.supabaseAdmin
  const profileClub = String(
    ctx.profile?.club_id ?? ctx.salesClubId ?? ctx.supervisorClubId ?? '',
  ).trim()

  if (op === 'delete') {
    if (!remote_id) return { ok: true }
    const { data: row } = await supabaseAdmin
      .from('client_az_instructors')
      .select('client_id, club_id')
      .eq('id', remote_id)
      .maybeSingle()
    if (!row?.client_id) return { ok: true }
    if (ctx.isAdmin) return { ok: true }
    if (!(await canAccessClient(ctx, row.client_id))) {
      return { ok: false, error: 'Нет доступа' }
    }
    if (profileClub && String(row.club_id ?? '') !== profileClub) {
      return { ok: false, error: 'Нет доступа к клубу' }
    }
    return { ok: true }
  }

  const data = roleGate.data
  if (!(await canAccessClient(ctx, data.client_id))) {
    return { ok: false, error: 'Нет доступа к клиенту' }
  }

  if (!ctx.isAdmin) {
    const clubCheck = assertSalesManagerSameClub(profileClub, data.club_id)
    if (!clubCheck.ok) return clubCheck
  }

  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, club_id')
    .eq('id', data.client_id)
    .maybeSingle()
  if (clientErr) throw clientErr
  if (!client) return { ok: false, error: 'Клиент не найден' }
  if (String(client.club_id ?? '') !== data.club_id) {
    return { ok: false, error: 'Клуб клиента не совпадает' }
  }

  const { data: instructor, error: instErr } = await supabaseAdmin
    .from('users')
    .select('id, club_id, role, is_active')
    .eq('id', data.instructor_id)
    .maybeSingle()
  if (instErr) throw instErr
  if (!instructor || instructor.is_active === false) {
    return { ok: false, error: 'Инструктор не найден или неактивен' }
  }
  if (String(instructor.club_id ?? '') !== data.club_id) {
    return { ok: false, error: 'Инструктор из другого клуба' }
  }
  const roles = new Set(USERS_TRAINER_ROLES.map((r) => r.toLowerCase()))
  if (!roles.has(String(instructor.role ?? '').trim().toLowerCase())) {
    return { ok: false, error: 'Инструктор АЗ — только роль тренера клуба' }
  }

  const { data: mt, error: mtErr } = await supabaseAdmin
    .from('membership_types')
    .select('id, club_id, trainer_assignable, is_active')
    .eq('id', data.direction_type_id)
    .maybeSingle()
  if (mtErr) throw mtErr
  if (!mt || mt.is_active === false) {
    return { ok: false, error: 'Направление не найдено' }
  }
  if (String(mt.club_id ?? '') !== data.club_id) {
    return { ok: false, error: 'Направление другого клуба' }
  }
  if (!isAerobicSalesMembershipType(mt)) {
    return { ok: false, error: 'Направление должно быть типом АЗ' }
  }

  if (op === 'update' && remote_id && isClientAzInstructorUuid(remote_id)) {
    const { data: existing } = await supabaseAdmin
      .from('client_az_instructors')
      .select('client_id')
      .eq('id', remote_id)
      .maybeSingle()
    if (existing && String(existing.client_id) !== data.client_id) {
      return { ok: false, error: 'Нельзя переназначить запись другому клиенту' }
    }
  }

  return { ok: true, data }
}
