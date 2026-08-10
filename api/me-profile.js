/**
 * Профиль текущего пользователя из public.users (обход ERR_CONNECTION_RESET).
 */
import { createClient } from '@supabase/supabase-js'
import { readEnv, sendJson, setCors } from './_lib/adminSupabase.js'
import { AUTH_ENV_MISSING_RU, verifyBearer } from './_lib/authPort.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

async function handler(req, res) {
  setCors(res, 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const { url, serviceKey, anonKey } = readEnv()
  if (!url || !serviceKey || !anonKey) {
    sendJson(res, 500, { error: AUTH_ENV_MISSING_RU })
    return
  }

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
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
  const full = await supabaseAdmin
    .from('users')
    .select('role, name, email, phone, login, club_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!full.error && full.data) {
    sendJson(res, 200, { profile: full.data })
    return
  }

  const basic = await supabaseAdmin
    .from('users')
    .select('role, name, email, phone, login')
    .eq('id', user.id)
    .maybeSingle()

  if (basic.error) {
    sendJson(res, 400, { error: basic.error.message })
    return
  }

  sendJson(res, 200, { profile: basic.data ? { ...basic.data, club_id: null } : null })
}

export default withSafeApiHandler(handler, { label: 'me-profile' })
