/**
 * Права менеджера продаж на клиентов клуба (чистая логика, без React/IDB).
 * Список/карточка/абоны своего club_id; без чужих клубов и без справочников.
 */

import { normalizeDeskHall } from './deskHallClientsCore.js'

/** Таблицы, которые менеджер может писать через push (коммерческий контур). */
export const SALES_MANAGER_CLIENT_PUSH_TABLES = Object.freeze([
  'clients',
  'memberships',
  'client_hall_lifecycle',
])

/**
 * Каскад удаления desk ТЗ/АЗ может затронуть эти таблицы (обычно пустые).
 * Разрешаем только delete и только для desk своего клуба.
 */
export const SALES_MANAGER_DESK_DELETE_EXTRA_TABLES = Object.freeze([
  'trainings',
  'health_cards',
  'body_measurements',
  'client_weight_entries',
])

/**
 * Вход в /api/push-record(s): админ, тренер или менеджер (дальше — authorizePush).
 * @param {{ isAdmin?: boolean, isTrainer?: boolean, isSalesManager?: boolean } | null | undefined} ctx
 */
export function canUseSyncPushApi(ctx) {
  return Boolean(ctx?.isAdmin || ctx?.isTrainer || ctx?.isSalesManager || ctx?.isSupervisor)
}

/** @param {string} [tableName] */
export function isSalesManagerClientPushTable(tableName) {
  return SALES_MANAGER_CLIENT_PUSH_TABLES.includes(String(tableName ?? '').trim())
}

/** @param {string} [tableName] */
export function isSalesManagerDeskDeleteExtraTable(tableName) {
  return SALES_MANAGER_DESK_DELETE_EXTRA_TABLES.includes(String(tableName ?? '').trim())
}

/**
 * @param {string} [profileClubId]
 * @param {string} [rowClubId]
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertSalesManagerSameClub(profileClubId, rowClubId) {
  const profile = String(profileClubId ?? '').trim()
  const row = String(rowClubId ?? '').trim()
  if (!profile) return { ok: false, error: 'У менеджера не задан club_id' }
  if (!row) return { ok: false, error: 'У записи нет club_id' }
  if (profile !== row) return { ok: false, error: 'Нет доступа к клиентам другого клуба' }
  return { ok: true }
}

/** @param {unknown} deskHall */
export function isDeskHallTzOrAz(deskHall) {
  return normalizeDeskHall(deskHall) != null
}

/**
 * Менеджер может жёстко удалить только desk ТЗ/АЗ своего клуба (не ПЗ / lite).
 * @param {string} [profileClubId]
 * @param {{ club_id?: unknown, desk_hall?: unknown }} [client]
 */
export function assertSalesManagerDeskClientDelete(profileClubId, client) {
  const clubCheck = assertSalesManagerSameClub(profileClubId, client?.club_id)
  if (!clubCheck.ok) return clubCheck
  if (!isDeskHallTzOrAz(client?.desk_hall)) {
    return { ok: false, error: 'Менеджер может удалять только клиентов ТЗ/АЗ (desk)' }
  }
  return { ok: true }
}

/**
 * UI: показывать «Удалить» менеджеру только на desk ТЗ/АЗ.
 * @param {boolean} isSalesManager
 * @param {{ desk_hall?: unknown } | null | undefined} client
 */
export function canSalesManagerHardDeleteClient(isSalesManager, client) {
  if (!isSalesManager) return true
  return isDeskHallTzOrAz(client?.desk_hall)
}

/**
 * Insert клиента: club_id = клуб менеджера; desk (tz|az) или с trainer_id.
 * @param {string} [profileClubId]
 * @param {Record<string, unknown>} [payload]
 */
export function assertSalesManagerClientInsert(profileClubId, payload) {
  const clubCheck = assertSalesManagerSameClub(profileClubId, payload?.club_id)
  if (!clubCheck.ok) return clubCheck
  const desk = String(payload?.desk_hall ?? '').trim().toLowerCase()
  const tid = payload?.trainer_id
  const hasTrainer = tid != null && String(tid).trim() !== ''
  if (desk === 'tz' || desk === 'az') {
    if (hasTrainer) {
      return { ok: false, error: 'Desk ТЗ/АЗ создаётся без тренера' }
    }
    return { ok: true }
  }
  if (desk && desk !== 'tz' && desk !== 'az') {
    return { ok: false, error: 'Некорректный desk_hall' }
  }
  if (!hasTrainer) {
    return { ok: false, error: 'Укажите тренера или зал desk (ТЗ/АЗ)' }
  }
  return { ok: true }
}

/**
 * Update: нельзя увести клиента в другой клуб.
 * @param {string} [profileClubId]
 * @param {string} [existingClubId]
 * @param {Record<string, unknown>} [payload]
 */
export function assertSalesManagerClientUpdate(profileClubId, existingClubId, payload) {
  const existing = assertSalesManagerSameClub(profileClubId, existingClubId)
  if (!existing.ok) return existing
  if (Object.prototype.hasOwnProperty.call(payload ?? {}, 'club_id')) {
    return assertSalesManagerSameClub(profileClubId, payload.club_id)
  }
  return { ok: true }
}
