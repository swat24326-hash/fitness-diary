import { createClient } from '@supabase/supabase-js'
import { isAdminByRole } from '../../src/lib/admin/adminRoleCore.js'
import { isSalesManagerRole } from '../../src/lib/admin/salesAccessCore.js'
import { isSupervisorRole } from '../../src/lib/admin/supervisorAccessCore.js'
import { AUTH_ENV_MISSING_RU, verifyBearer } from './authPort.js'

export function readEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, serviceKey, anonKey }
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
}

const TRAINER_ROLES = new Set(['trainer', 'тренер'])
const SALES_MANAGER_ROLES = new Set(['sales_manager', 'менеджер по продажам'])

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase()
}

function isTrainerRole(roleNorm) {
  return TRAINER_ROLES.has(roleNorm)
}

function isSalesManagerRoleNorm(roleNorm) {
  return SALES_MANAGER_ROLES.has(roleNorm) || isSalesManagerRole(roleNorm)
}

function isSupervisorRoleNorm(roleNorm) {
  return isSupervisorRole(roleNorm)
}

/**
 * @returns {Promise<{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, user: object, profile: object | null, roleNorm: string, isAdmin: boolean, isTrainer: boolean, isSalesManager: boolean, isSupervisor: boolean } | null>}
 */
export async function requireAuthUser(req, res) {
  const { url, serviceKey, anonKey } = readEnv()
  if (!url || !serviceKey || !anonKey) {
    sendJson(res, 500, { error: AUTH_ENV_MISSING_RU })
    return null
  }

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return null
  }

  const token = String(authHeader).slice('Bearer '.length).trim()
  const { user, error: userErr } = await verifyBearer(url, anonKey, token)
  if (userErr || !user) {
    sendJson(res, 401, { error: userErr || 'Сессия недействительна — войдите снова' })
    return null
  }

  const supabaseAdmin = createClient(url, serviceKey)

  const callerEmail = String(user.email ?? '')
    .trim()
    .toLowerCase()
  let profile = (
    await supabaseAdmin.from('users').select('id, role, email, club_id, name').eq('id', user.id).maybeSingle()
  ).data
  if (!profile?.role && callerEmail) {
    profile = (
      await supabaseAdmin.from('users').select('id, role, email, club_id, name').ilike('email', callerEmail).maybeSingle()
    ).data
  }
  const roleNorm = normalizeRole(profile?.role)
  const isAdmin = isAdminByRole(roleNorm)
  const isSalesManager = isSalesManagerRoleNorm(roleNorm)
  const isSupervisor = isSupervisorRoleNorm(roleNorm)
  // Пустая role не даёт прав тренера — только явная роль trainer / «тренер».
  const isTrainer = isTrainerRole(roleNorm)

  return { supabaseAdmin, user, profile, roleNorm, isAdmin, isTrainer, isSalesManager, isSupervisor }
}

/** Доступ к list-trainers и trainer-pull: админ или явная роль тренера. */
export function canAccessTrainerOrAdminApis(ctx) {
  if (!ctx) return false
  if (ctx.isAdmin || ctx.isTrainer) return true
  return false
}

/**
 * Админ сети, менеджер продаж или управляющий — с проверкой club_id для club-ролей.
 * Управляющий получает isSalesManager=false (полный sales bundle, как админ клуба).
 * @returns {Promise<(typeof ctx & { isSalesManager?: boolean, isSupervisor?: boolean, salesClubId?: string, supervisorClubId?: string }) | null>}
 */
export async function requireAdminOrSalesManager(req, res, clubId) {
  const ctx = await requireAuthUser(req, res)
  if (!ctx) return null
  if (ctx.isAdmin) {
    return { ...ctx, isSalesManager: false, isSupervisor: false }
  }
  if (ctx.isSupervisor) {
    const profileClub = String(ctx.profile?.club_id ?? '').trim()
    const requested = String(clubId ?? '').trim()
    if (!profileClub) {
      sendJson(res, 403, { error: 'У управляющего не задан club_id — обратитесь к администратору' })
      return null
    }
    if (requested && requested !== profileClub) {
      sendJson(res, 403, { error: 'Нет доступа к этому клубу' })
      return null
    }
    return {
      ...ctx,
      isSalesManager: false,
      isSupervisor: true,
      salesClubId: profileClub,
      supervisorClubId: profileClub,
    }
  }
  if (!ctx.isSalesManager) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return null
  }
  const profileClub = String(ctx.profile?.club_id ?? '').trim()
  const requested = String(clubId ?? '').trim()
  if (!profileClub) {
    sendJson(res, 403, { error: 'У менеджера не задан club_id — обратитесь к администратору' })
    return null
  }
  if (requested && requested !== profileClub) {
    sendJson(res, 403, { error: 'Нет доступа к этому клубу' })
    return null
  }
  return { ...ctx, isSalesManager: true, isSupervisor: false, salesClubId: profileClub }
}

/** Админ или управляющий своего клуба (статистика, журнал). */
export async function requireAdminOrSupervisor(req, res, clubId) {
  const ctx = await requireAuthUser(req, res)
  if (!ctx) return null
  if (ctx.isAdmin) {
    return { ...ctx, isSupervisor: false }
  }
  if (!ctx.isSupervisor) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return null
  }
  const profileClub = String(ctx.profile?.club_id ?? '').trim()
  const requested = String(clubId ?? '').trim()
  if (!profileClub) {
    sendJson(res, 403, { error: 'У управляющего не задан club_id — обратитесь к администратору' })
    return null
  }
  if (requested && requested !== profileClub) {
    sendJson(res, 403, { error: 'Нет доступа к этому клубу' })
    return null
  }
  return { ...ctx, isSupervisor: true, supervisorClubId: profileClub }
}

/** @returns {Promise<Awaited<ReturnType<typeof requireAuthUser>> | null>} */
export async function requireAdmin(req, res) {
  const ctx = await requireAuthUser(req, res)
  if (!ctx) return null
  if (!ctx.isAdmin) {
    sendJson(res, 403, { error: 'Только администратор' })
    return null
  }
  return ctx
}
