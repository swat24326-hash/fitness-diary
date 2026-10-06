/**
 * Создать тренера (Auth + public.users).
 * Секреты только на сервере API: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * (или VITE_* для URL/anon — service role без префикса VITE_).
 */
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { createServiceDataClient } from './_lib/pgRest/serviceClient.js'
import { authRuntimeEnvError, adminCreateUser, adminDeleteUser, passwordHashForUsersRow, verifyBearer } from './_lib/authPort.js'
import { formatClientName } from '../src/lib/clientNameFormat.js'
import { isAdminByRole } from '../src/lib/admin/adminRoleCore.js'
import { ilikeExactPattern } from '../src/lib/ilikeExactCore.js'
import { trainerCreateErrorRu } from '../src/lib/admin/trainerAuthAdminCore.js'
import { newPasswordError } from '../src/lib/passwordPolicyCore.js'
import { normalizeLoginInput, normalizePasswordInput } from './_lib/authLoginResolveCore.js'

function readEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, serviceKey, anonKey }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const envErr = authRuntimeEnvError()
  if (envErr) {
    sendJson(res, 500, { error: envErr })
    return
  }
  const { url, anonKey } = readEnv()

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const token = String(authHeader).slice('Bearer '.length).trim()
  const { user, error: userErr } = await verifyBearer(url, anonKey, token)
  if (userErr || !user) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const supabaseAdmin = createServiceDataClient()

  const callerEmailPattern = ilikeExactPattern(user.email)
  let profile = (
    await supabaseAdmin.from('users').select('role, email').eq('id', user.id).maybeSingle()
  ).data
  if (!profile?.role && callerEmailPattern) {
    profile = (
      await supabaseAdmin.from('users').select('role, email').ilike('email', callerEmailPattern).maybeSingle()
    ).data
  }
  const isAdmin = isAdminByRole(profile?.role)
  if (!isAdmin) {
    sendJson(res, 403, { error: 'Только администратор может создавать тренеров' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
  }
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'Invalid JSON' })
    return
  }

  const name = formatClientName(body.name)
  const login = normalizeLoginInput(body.login).toLowerCase()
  const phone = String(body.phone ?? '').trim() || null
  const password = normalizePasswordInput(body.password)
  let email = String(body.email ?? '').trim()
  const rawClub = body.club_id != null ? String(body.club_id).trim() : ''
  const club_id =
    rawClub && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(rawClub)
      ? rawClub
      : null

  if (!name || !login || !password) {
    sendJson(res, 400, { error: 'Укажите ФИО, логин и пароль' })
    return
  }
  const passwordErr = newPasswordError(password)
  if (passwordErr) {
    sendJson(res, 400, { error: passwordErr })
    return
  }
  if (!club_id) {
    sendJson(res, 400, { error: 'Выберите клуб: тренер обязательно привязан к клубу' })
    return
  }
  if (!email) {
    email = `${login}@trainer.local`
  }

  const createdResult = await adminCreateUser(supabaseAdmin, {
    email,
    password,
    email_confirm: true,
  })
  const created = createdResult.user
  const auErr = createdResult.error

  if (auErr || !created) {
    sendJson(res, 400, { error: trainerCreateErrorRu(auErr) })
    return
  }

  const uid = created.id

  const insertRow = {
    id: uid,
    name,
    phone,
    email,
    login,
    role: 'trainer',
    password_hash: passwordHashForUsersRow(createdResult),
    is_active: true,
    // Новый: по умолчанию без планшета; явно uses_tablet: true → с планшетом
    uses_tablet: body.uses_tablet === true || body.uses_tablet === 'true',
    club_id,
  }

  const { error: insErr } = await supabaseAdmin.from('users').insert(insertRow)

  if (insErr) {
    await adminDeleteUser(supabaseAdmin, uid)
    sendJson(res, 400, { error: trainerCreateErrorRu(insErr.message) })
    return
  }

  const { password_hash: _hash, ...trainerPublic } = insertRow
  sendJson(res, 200, { ok: true, id: uid, trainer: trainerPublic })
}

export default withSafeApiHandler(handler, { label: 'create-trainer' })
