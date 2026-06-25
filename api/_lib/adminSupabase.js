import { createClient } from '@supabase/supabase-js'

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

const ADMIN_ROLES = new Set(['admin', 'администратор'])
const TRAINER_ROLES = new Set(['trainer', 'тренер'])

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase()
}

function isAdminRole(roleNorm, email) {
  const em = String(email ?? '').trim().toLowerCase()
  return ADMIN_ROLES.has(roleNorm) || em === 'admin@fit-city.ru'
}

function isTrainerRole(roleNorm) {
  return TRAINER_ROLES.has(roleNorm)
}

/**
 * @returns {Promise<{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, user: object, profile: object | null, roleNorm: string, isAdmin: boolean, isTrainer: boolean } | null>}
 */
export async function requireAuthUser(req, res) {
  const { url, serviceKey, anonKey } = readEnv()
  if (!url || !serviceKey || !anonKey) {
    sendJson(res, 500, {
      error:
        'На Vercel задайте SUPABASE_SERVICE_ROLE_KEY (и при необходимости SUPABASE_URL / SUPABASE_ANON_KEY), затем Redeploy.',
    })
    return null
  }

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return null
  }

  const supabaseAsCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: String(authHeader) } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseAsCaller.auth.getUser()
  if (userErr || !user) {
    sendJson(res, 401, { error: 'Сессия недействительна — войдите снова' })
    return null
  }

  const supabaseAdmin = createClient(url, serviceKey)

  const callerEmail = String(user.email ?? '')
    .trim()
    .toLowerCase()
  let profile = (
    await supabaseAdmin.from('users').select('role, email').eq('id', user.id).maybeSingle()
  ).data
  if (!profile?.role && callerEmail) {
    profile = (
      await supabaseAdmin.from('users').select('role, email').ilike('email', callerEmail).maybeSingle()
    ).data
  }
  const roleNorm = normalizeRole(profile?.role)
  const isAdmin = isAdminRole(roleNorm, callerEmail)
  /** Пустая role у не-админа — типичный тренер (в Table Editor не заполнили). */
  const isTrainer = isTrainerRole(roleNorm) || (!isAdmin && !!profile && !roleNorm)

  return { supabaseAdmin, user, profile, roleNorm, isAdmin, isTrainer }
}

/** Доступ к list-trainers и trainer-pull: админ или тренер (в т.ч. без role в users). */
export function canAccessTrainerOrAdminApis(ctx) {
  if (!ctx) return false
  if (ctx.isAdmin || ctx.isTrainer) return true
  return false
}

/** @returns {Promise<{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient, user: object } | null>} */
export async function requireAdmin(req, res) {
  const ctx = await requireAuthUser(req, res)
  if (!ctx) return null
  if (!ctx.isAdmin) {
    sendJson(res, 403, { error: 'Только администратор' })
    return null
  }
  return { supabaseAdmin: ctx.supabaseAdmin, user: ctx.user }
}
