import { isAdminByRole } from '../../src/lib/admin/adminRoleCore.js'
import { isSalesManagerRole } from '../../src/lib/admin/salesAccessCore.js'
import { isSupervisorRole } from '../../src/lib/admin/supervisorAccessCore.js'
import { ilikeExactPattern } from '../../src/lib/ilikeExactCore.js'
import { authRuntimeEnvError, verifyBearer } from './authPort.js'
import {
  AUTH_PROFILE_BLOCKED_RU,
  AUTH_PROFILE_CLOUD_UNAVAILABLE_RU,
  isCallerProfileBlocked,
  AUTH_PROFILE_MEMO_MAX,
  AUTH_PROFILE_QUERY_TIMEOUT_MS,
  AUTH_PROFILE_RETRY_DELAY_MS,
  AUTH_PROFILE_STALE_MAX_MS,
  AUTH_PROFILE_MEMO_TTL_MS,
  coalesceByKey,
  interpretUsersProfileQuery,
  readAuthProfileMemoHit,
} from './authCallerProfileCore.js'
import { createServiceDataClient } from './pgRest/serviceClient.js'
import { pruneVerifyBearerMemo } from './verifyBearerMemoCore.js'

/** @type {Map<string, { flags: object, at: number }>} */
const authProfileMemo = new Map()
/** @type {Map<string, Promise<{ kind: string, profile: object | null, message: string | null }>>} */
const authProfileInflight = new Map()

const CALLER_PROFILE_FIELDS = 'id, role, email, club_id, name, phone, login, is_active'

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} fields
 * @param {(q: import('@supabase/supabase-js').PostgrestFilterBuilder) => import('@supabase/supabase-js').PostgrestFilterBuilder} apply
 */
async function selectUsersProfile(supabaseAdmin, fields, apply) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), AUTH_PROFILE_QUERY_TIMEOUT_MS)
  try {
    let q = supabaseAdmin.from('users').select(fields)
    q = apply(q)
    return interpretUsersProfileQuery(await q.abortSignal(ctrl.signal).maybeSingle())
  } catch (e) {
    return interpretUsersProfileQuery({ data: null, error: { message: e?.message || 'fetch failed' } })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ id: string, email?: string }} user
 */
async function loadCallerProfileOnce(supabaseAdmin, user) {
  const byId = await selectUsersProfile(supabaseAdmin, CALLER_PROFILE_FIELDS, (q) => q.eq('id', user.id))
  if (byId.kind === 'query_error') return byId
  let profile = byId.profile
  const callerEmailPattern = ilikeExactPattern(user.email)
  if (!profile?.role && callerEmailPattern) {
    const byEmail = await selectUsersProfile(supabaseAdmin, CALLER_PROFILE_FIELDS, (q) =>
      q.ilike('email', callerEmailPattern),
    )
    if (byEmail.kind === 'query_error') return byEmail
    if (byEmail.profile) profile = byEmail.profile
  }
  return { kind: 'ok', profile, message: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ id: string, email?: string }} user
 */
async function loadCallerProfile(supabaseAdmin, user) {
  let last = await loadCallerProfileOnce(supabaseAdmin, user)
  if (last.kind !== 'query_error') return last
  await wait(AUTH_PROFILE_RETRY_DELAY_MS)
  last = await loadCallerProfileOnce(supabaseAdmin, user)
  if (last.kind !== 'query_error') return last
  await wait(AUTH_PROFILE_RETRY_DELAY_MS)
  return loadCallerProfileOnce(supabaseAdmin, user)
}

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
  const envErr = authRuntimeEnvError()
  if (envErr) {
    sendJson(res, 500, { error: envErr })
    return null
  }

  const { url, anonKey } = readEnv()

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

  const supabaseAdmin = createServiceDataClient()
  const now = Date.now()
  const memoFlags = readAuthProfileMemoHit(user.id, authProfileMemo.get(user.id), now)
  if (memoFlags) {
    if (isCallerProfileBlocked(memoFlags.profile)) {
      sendJson(res, 403, { error: AUTH_PROFILE_BLOCKED_RU })
      return null
    }
    return { supabaseAdmin, user, ...memoFlags }
  }

  const loaded = await coalesceByKey(authProfileInflight, user.id, () => loadCallerProfile(supabaseAdmin, user))
  if (loaded.kind === 'query_error') {
    const staleFlags = readAuthProfileMemoHit(
      user.id,
      authProfileMemo.get(user.id),
      now,
      AUTH_PROFILE_MEMO_TTL_MS,
      AUTH_PROFILE_STALE_MAX_MS,
    )
    if (staleFlags) {
      return { supabaseAdmin, user, ...staleFlags }
    }
    console.warn('[auth-profile]', loaded.message || AUTH_PROFILE_CLOUD_UNAVAILABLE_RU)
    sendJson(res, 503, { error: AUTH_PROFILE_CLOUD_UNAVAILABLE_RU })
    return null
  }

  const profile = loaded.profile
  const roleNorm = normalizeRole(profile?.role)
  const isAdmin = isAdminByRole(roleNorm)
  const isSalesManager = isSalesManagerRoleNorm(roleNorm)
  const isSupervisor = isSupervisorRoleNorm(roleNorm)
  // Пустая role не даёт прав тренера — только явная роль trainer / «тренер».
  const isTrainer = isTrainerRole(roleNorm)
  const flags = { profile, roleNorm, isAdmin, isTrainer, isSalesManager, isSupervisor }
  authProfileMemo.set(user.id, { flags, at: now })
  pruneVerifyBearerMemo(authProfileMemo, AUTH_PROFILE_MEMO_MAX)
  if (isCallerProfileBlocked(profile)) {
    sendJson(res, 403, { error: AUTH_PROFILE_BLOCKED_RU })
    return null
  }

  return { supabaseAdmin, user, ...flags }
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
