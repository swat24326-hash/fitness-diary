/**
 * Edge Function: удалить тренера из Auth и public.users (роль trainer).
 * Требует JWT администратора. Развёртывание: `supabase functions deploy delete-trainer`
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

const TRAINER_ROLES = ['trainer', 'тренер']

function isTrainerRole(role: string | null | undefined) {
  return role != null && TRAINER_ROLES.includes(role)
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

  const { data: profile, error: profErr } = await supabaseAdmin.from('users').select('role').eq('id', user.id).maybeSingle()

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

  const trainerId = String(body.trainer_id ?? '').trim()
  if (!trainerId || !/^[0-9a-fA-F-]{36}$/.test(trainerId)) {
    return json(400, { error: 'Укажите корректный trainer_id (UUID)' })
  }

  const { count, error: cntErr } = await supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)

  if (cntErr) {
    return json(400, { error: cntErr.message })
  }
  if ((count ?? 0) > 0) {
    return json(400, { error: `У тренера есть клиенты (${count}). Сначала переназначьте их.` })
  }

  const { data: victim, error: vErr } = await supabaseAdmin.from('users').select('id, role').eq('id', trainerId).maybeSingle()

  if (vErr) {
    return json(400, { error: vErr.message })
  }
  if (!victim || !isTrainerRole(victim.role)) {
    return json(404, { error: 'Тренер не найден' })
  }

  const { error: delUserRow } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', trainerId)
    .in('role', TRAINER_ROLES)
  if (delUserRow) {
    return json(400, { error: delUserRow.message })
  }

  const { error: delAuth } = await supabaseAdmin.auth.admin.deleteUser(trainerId)
  if (delAuth) {
    return json(400, { error: delAuth.message })
  }

  return json(200, { ok: true })
})
