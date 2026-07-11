/**
 * Вход через сервер Vercel (обход ERR_CONNECTION_RESET браузер → Supabase Auth).
 * POST { login, password } — login может быть email или логин из users.login.
 */
import { createClient } from '@supabase/supabase-js'
import { readEnv, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { emailFromLoginRow, normalizeLoginInput, trainerLocalEmail } from './_lib/authLoginResolveCore.js'

async function resolveEmail(supabaseAdmin, raw) {
  const trimmed = normalizeLoginInput(raw)
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const row = await supabaseAdmin.from('users').select('email, is_active').ilike('email', trimmed).maybeSingle()
    const picked = emailFromLoginRow(row.data, trimmed)
    return picked ?? { email: trimmed, isActive: row.data?.is_active !== false }
  }

  const loginLower = trimmed.toLowerCase()
  const synthEmail = trainerLocalEmail(trimmed)

  const attempts = [
    () => supabaseAdmin.from('users').select('email, is_active').eq('login', loginLower).maybeSingle(),
    () => supabaseAdmin.from('users').select('email, is_active').ilike('login', trimmed).maybeSingle(),
  ]
  if (synthEmail) {
    attempts.push(() => supabaseAdmin.from('users').select('email, is_active').ilike('email', synthEmail).maybeSingle())
  }

  for (const run of attempts) {
    const { data } = await run()
    const picked = emailFromLoginRow(data, trimmed)
    if (picked) return picked
  }

  if (synthEmail) {
    return { email: synthEmail, isActive: true }
  }

  return null
}

async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')

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
      error: 'На Vercel задайте SUPABASE_SERVICE_ROLE_KEY и URL проекта, затем Redeploy.',
    })
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

  const login = String(body?.login ?? '').trim()
  const password = String(body?.password ?? '')
  if (!login || !password) {
    sendJson(res, 400, { error: 'Введите логин и пароль' })
    return
  }

  const supabaseAdmin = createClient(url, serviceKey)

  let emailForAuth = login
  let isActive = true
  if (login.includes('@')) {
    const resolved = await resolveEmail(supabaseAdmin, login)
    if (resolved?.email) {
      emailForAuth = resolved.email
      isActive = resolved.isActive !== false
    } else {
      const row = await supabaseAdmin.from('users').select('is_active').ilike('email', login).maybeSingle()
      if (row.data) isActive = row.data.is_active !== false
    }
  } else {
    const resolved = await resolveEmail(supabaseAdmin, login)
    if (!resolved?.email) {
      sendJson(res, 401, {
        error: 'Пользователь с таким логином не найден. Проверьте раскладку или войдите по email.',
      })
      return
    }
    emailForAuth = String(resolved.email).trim()
    isActive = resolved.isActive !== false
  }

  if (!isActive) {
    sendJson(res, 403, { error: 'Учётная запись заблокирована' })
    return
  }
  const supabaseAuth = createClient(url, anonKey)
  const { data: authData, error: authErr } = await supabaseAuth.auth.signInWithPassword({
    email: emailForAuth,
    password,
  })

  if (authErr || !authData?.session) {
    const msg = String(authErr?.message ?? 'Неверный логин или пароль')
    if (/invalid login|invalid credentials|invalid password/i.test(msg)) {
      sendJson(res, 401, { error: 'Неверный логин или пароль' })
      return
    }
    sendJson(res, 400, { error: msg })
    return
  }

  const uid = authData.user?.id
  let profile = null
  if (uid) {
    const full = await supabaseAdmin
      .from('users')
      .select('role, name, email, phone, login, club_id')
      .eq('id', uid)
      .maybeSingle()
    if (!full.error) profile = full.data
    else {
      const basic = await supabaseAdmin
        .from('users')
        .select('role, name, email, phone, login')
        .eq('id', uid)
        .maybeSingle()
      if (!basic.error) profile = basic.data ? { ...basic.data, club_id: null } : null
    }
  }

  sendJson(res, 200, {
    session: {
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
      expires_at: authData.session.expires_at,
    },
    user: authData.user,
    profile,
  })
}

export default withSafeApiHandler(handler, { label: 'auth-sign-in' })
