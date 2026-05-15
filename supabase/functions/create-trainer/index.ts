/**
 * Edge Function: создать пользователя Auth + строку в public.users (роль trainer).
 * Развёртывание: `supabase functions deploy create-trainer --no-verify-jwt` не используйте —
 * JWT нужен; в Dashboard Functions включите «Verify JWT».
 *
 * Секреты подставляются автоматически: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: 'Missing Supabase env in function runtime' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Unauthorized' })
  }

  const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseAsCaller.auth.getUser()
  if (userErr || !user) {
    return json(401, { error: 'Unauthorized' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  const { data: profile, error: profErr } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profErr) {
    return json(500, { error: profErr.message })
  }
  if (profile?.role !== 'admin') {
    return json(403, { error: 'Forbidden' })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const name = String(body.name ?? '').trim()
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
    return json(400, { error: 'Укажите имя, логин и пароль' })
  }
  if (password.length < 6) {
    return json(400, { error: 'Пароль не короче 6 символов' })
  }
  if (!club_id) {
    return json(400, { error: 'Выберите клуб: тренер обязательно привязан к клубу' })
  }
  if (!email) {
    email = `${login}@trainer.local`
  }

  const { data: created, error: auErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (auErr || !created?.user) {
    return json(400, { error: auErr?.message ?? 'Не удалось создать пользователя в Auth' })
  }

  const uid = created.user.id

  const insertRow: Record<string, unknown> = {
    id: uid,
    name,
    phone,
    email,
    login,
    role: 'trainer',
    password_hash: 'supabase-auth',
    is_active: true,
    club_id,
  }

  const { error: insErr } = await supabaseAdmin.from('users').insert(insertRow)

  if (insErr) {
    await supabaseAdmin.auth.admin.deleteUser(uid)
    return json(400, { error: insErr.message })
  }

  return json(200, { ok: true, id: uid })
})
