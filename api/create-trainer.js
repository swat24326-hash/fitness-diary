/**
 * Создать тренера (Auth + public.users).
 * Секреты только на сервере API: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * (или VITE_* для URL/anon — service role без префикса VITE_).
 */
import { createClient } from '@supabase/supabase-js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { AUTH_ENV_MISSING_RU, adminCreateUser, adminDeleteUser, verifyBearer } from './_lib/authPort.js'
import { formatClientName } from '../src/lib/clientNameFormat.js'

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

  const { url, serviceKey, anonKey } = readEnv()
  if (!url || !serviceKey || !anonKey) {
    sendJson(res, 500, {
      error: `${AUTH_ENV_MISSING_RU} Ключ service role — в настройках Auth/БД хостинга.`,
    })
    return
  }

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
  const isAdmin = profile?.role === 'admin' || callerEmail === 'admin@fit-city.ru'
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
  const login = String(body.login ?? '')
    .trim()
    .toLowerCase()
  const phone = String(body.phone ?? '').trim() || null
  const password = String(body.password ?? '')
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
  if (password.length < 6) {
    sendJson(res, 400, { error: 'Пароль не короче 6 символов' })
    return
  }
  if (!club_id) {
    sendJson(res, 400, { error: 'Выберите клуб: тренер обязательно привязан к клубу' })
    return
  }
  if (!email) {
    email = `${login}@trainer.local`
  }

  const { user: created, error: auErr } = await adminCreateUser(supabaseAdmin, {
    email,
    password,
    email_confirm: true,
  })

  if (auErr || !created) {
    sendJson(res, 400, { error: auErr ?? 'Не удалось создать пользователя в Auth' })
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
    password_hash: 'supabase-auth',
    is_active: true,
    // Новый: по умолчанию без планшета; явно uses_tablet: true → с планшетом
    uses_tablet: body.uses_tablet === true || body.uses_tablet === 'true',
    club_id,
  }

  const { error: insErr } = await supabaseAdmin.from('users').insert(insertRow)

  if (insErr) {
    await adminDeleteUser(supabaseAdmin, uid)
    sendJson(res, 400, { error: insErr.message })
    return
  }

  sendJson(res, 200, { ok: true, id: uid, trainer: insertRow })
}

export default withSafeApiHandler(handler, { label: 'create-trainer' })
