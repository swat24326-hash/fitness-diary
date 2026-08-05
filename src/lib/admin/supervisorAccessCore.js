/**
 * Права управляющего клуба (supervisor) — чистая логика, без React/IDB.
 * ТЗ: docs/CLUB_SUPERVISOR.md
 */

import { USERS_SUPERVISOR_ROLES } from '../userRoleConstants.js'

/** @param {string} [role] */
export function normalizeSupervisorRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  if (USERS_SUPERVISOR_ROLES.includes(r) || r === 'supervisor') return 'supervisor'
  return r
}

/** @param {string} [role] */
export function isSupervisorRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  return USERS_SUPERVISOR_ROLES.includes(r)
}

/** @param {string} [profileClubId] @param {string} [requestedClubId] */
export function canSupervisorAccessClub(profileClubId, requestedClubId) {
  const club = String(profileClubId ?? '').trim()
  const req = String(requestedClubId ?? '').trim()
  if (!club) return false
  if (!req) return true
  return club === req
}

/**
 * Один управляющий на клуб (жёстко при создании).
 * @param {number} existingActiveCount
 */
export function assertCanCreateSupervisor(existingActiveCount) {
  const n = Number(existingActiveCount) || 0
  if (n > 0) {
    return {
      ok: false,
      error: 'В этом клубе уже есть управляющий. На клуб — один управляющий.',
    }
  }
  return { ok: true }
}

/** Справочники сети — push запрещён. */
export const SUPERVISOR_DENIED_PUSH_TABLES = Object.freeze([
  'membership_types',
  'nutrition_products',
  'homework_presets',
  'exercises',
])

/** @param {string} tableName */
export function isSupervisorDeniedPushTable(tableName) {
  return SUPERVISOR_DENIED_PUSH_TABLES.includes(String(tableName ?? ''))
}

/**
 * Журнал удалений: админ сети и (пока) менеджер продаж; управляющий — нет.
 * @param {{ isAdmin?: boolean, isSupervisor?: boolean, isSalesManager?: boolean }} ctx
 */
export function canAccessDeletionAuditLog(ctx) {
  if (ctx?.isSupervisor) return false
  return Boolean(ctx?.isAdmin || ctx?.isSalesManager)
}

/**
 * Базовый путь оболочки управляющего.
 * @param {string} [section] clients | statistics | …
 */
export function supervisorHomePath(section) {
  const s = String(section ?? '').trim().replace(/^\/+/, '')
  return s ? `/club/${s}` : '/club'
}
