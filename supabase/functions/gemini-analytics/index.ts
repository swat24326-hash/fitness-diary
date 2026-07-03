/**
 * Edge Function: Gemini-аналитик «Василий / Василиса».
 * Секрет: GEMINI_API_KEY (Supabase → Edge Functions → Secrets).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']
const rateLimitMs = 12000
const lastByUser = new Map<string, number>()

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildPersona(gender: string) {
  if (gender === 'female') {
    return { name: 'Василиса', persona: 'авторитетная старшая сестра команды' }
  }
  return { name: 'Василий', persona: 'близкий кент и старший брат команды' }
}

function buildSystemPrompt(gender: string, clubName: string) {
  const { name, persona } = buildPersona(gender)
  const club = clubName.trim() || 'филиал'
  return [
    `Ты — ${name}, внутренний аналитик команды FIT-CITY. Твой характер: ${persona}.`,
    `Говоришь по-братски, живо, с сленгом (красава, косяк, поднажать, на связи).`,
    `Хвали за сильные цифры, жёстко критикуй слабые места — без мата и личных оскорблений.`,
    `Анализируй ТОЛЬКО филиал «${club}» — называй его по имени в ответе.`,
    `Опирайся ТОЛЬКО на JSON-данные в сообщении пользователя. Не выдумывай цифры.`,
    `Если данных мало или отчёты пустые — скажи прямо, что база не забита.`,
    `Ответ: один абзац на русском, 4–8 предложений, без markdown и списков.`,
  ].join('\n')
}

function trimMessages(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-10)
}

function buildContents(body: Record<string, unknown>, gender: string) {
  const history = trimMessages(body.messages)
  const userMessage = String(body.user_message ?? '').trim()
  const snapshot = body.snapshot ?? {}
  const previous = body.previous_snapshot ?? null
  const dataBlock = { current_period: snapshot, previous_period: previous }
  const personaName = buildPersona(gender).name

  const textParts: string[] = []
  for (const msg of history) {
    const role = msg.role === 'assistant' ? personaName : 'Руководитель'
    textParts.push(`[${role}]: ${String(msg.content ?? '').trim()}`)
  }
  const prefix = history.length ? 'Актуальные данные' : 'Данные для анализа'
  textParts.push(
    `${prefix} (JSON):\n${JSON.stringify(dataBlock, null, 2)}\n\n${history.length ? 'Новый вопрос' : 'Вопрос'}: ${userMessage}`,
  )

  return [{ role: 'user', parts: [{ text: textParts.join('\n\n') }] }]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isOverloadError(message: string) {
  const s = message.toLowerCase()
  return (
    s.includes('high demand') ||
    s.includes('overloaded') ||
    s.includes('try again later') ||
    s.includes('temporarily unavailable') ||
    s.includes('service unavailable') ||
    s.includes('503')
  )
}

function isRetryableError(message: string) {
  const s = message.toLowerCase()
  if (s.includes('quota') || s.includes('rate limit') || s.includes('429') || s.includes('resource_exhausted')) {
    return true
  }
  if (isOverloadError(s)) return true
  return (
    s.includes('not found') ||
    s.includes('not supported') ||
    s.includes('is not found for api version') ||
    s.includes('has been shut down') ||
    s.includes('deprecated')
  )
}

function formatUserError(message: string) {
  const raw = String(message ?? '').trim()
  if (!raw) return 'Не удалось получить ответ от Gemini'
  if (isOverloadError(raw)) {
    return 'Gemini перегружен — подождите 10–20 сек и спросите снова.'
  }
  const s = raw.toLowerCase()
  if (s.includes('quota') || s.includes('rate limit') || s.includes('429') || s.includes('resource_exhausted')) {
    const retry = raw.match(/retry in ([\d.]+)s/i)
    const waitSec = retry ? Math.ceil(Number(retry[1])) : 0
    const wait = waitSec > 0 ? ` Подождите ~${waitSec} сек.` : ' Подождите минуту.'
    return `Лимит бесплатного Gemini исчерпан.${wait} Новый ключ: aistudio.google.com`
  }
  if (raw.length > 220) return `${raw.slice(0, 217)}…`
  return raw
}

async function callGemini(apiKey: string, systemPrompt: string, contents: object[]) {
  let lastErr = 'Gemini error'
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(1500)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 1024 },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        lastErr = String((data as { error?: { message?: string } })?.error?.message ?? res.statusText)
        if (isRetryableError(lastErr)) {
          if (attempt === 0 && isOverloadError(lastErr)) continue
          break
        }
        throw new Error(formatUserError(lastErr))
      }
      const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]
        ?.content?.parts
      const text = Array.isArray(parts) ? parts.map((p) => String(p?.text ?? '')).join('').trim() : ''
      if (!text) throw new Error('Пустой ответ Gemini')
      return text
    }
    if (i + 1 < MODELS.length) await sleep(800)
  }
  throw new Error(formatUserError(lastErr))
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
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: 'Missing Supabase env' })
  }
  if (!geminiKey) {
    return json(500, { error: 'GEMINI_API_KEY не задан в Secrets' })
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
  const callerEmail = String(user.email ?? '').trim().toLowerCase()
  let profile = (
    await supabaseAdmin.from('users').select('role, email').eq('id', user.id).maybeSingle()
  ).data
  if (!profile?.role && callerEmail) {
    profile = (
      await supabaseAdmin.from('users').select('role, email').ilike('email', callerEmail).maybeSingle()
    ).data
  }
  const roleNorm = String(profile?.role ?? '').trim().toLowerCase()
  const isAdmin = roleNorm === 'admin' || roleNorm === 'администратор' || callerEmail === 'admin@fit-city.ru'
  if (!isAdmin) {
    return json(403, { error: 'Только администратор' })
  }

  const now = Date.now()
  const uid = String(user.id)
  const last = lastByUser.get(uid) ?? 0
  if (now - last < rateLimitMs) {
    return json(429, { error: 'Подождите несколько секунд' })
  }
  lastByUser.set(uid, now)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const gender = body.gender === 'female' ? 'female' : 'male'
  const clubName = String(body.club_name ?? (body.snapshot as { club_name?: string })?.club_name ?? '').trim()
  const userMessage = String(body.user_message ?? '').trim()
  if (!userMessage) {
    return json(400, { error: 'Укажите user_message' })
  }

  try {
    const systemPrompt = buildSystemPrompt(gender, clubName)
    const contents = buildContents(body, gender)
    const text = await callGemini(geminiKey, systemPrompt, contents)
    const persona = buildPersona(gender)
    return json(200, { text, persona: persona.name, club_name: clubName, source: 'edge' })
  } catch (e) {
    return json(400, { error: e instanceof Error ? formatUserError(e.message) : 'Gemini error' })
  }
})
