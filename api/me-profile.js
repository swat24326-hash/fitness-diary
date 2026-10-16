/**
 * Профиль текущего пользователя из public.users (обход ERR_CONNECTION_RESET).
 * GET ?avatar=<ключ> — картинка фото профиля без входа (ключ выдают только списки переписки; avatarHandler.js).
 * POST { action: 'avatar-get' | 'avatar-set' (data — base64 JPEG) | 'avatar-delete' } — своё фото профиля.
 * POST { action: 'offer-accept', version } — управляющий принимает оферту (offerCore.js).
 */
import { OFFER_VERSION } from '../src/lib/legal/offerCore.js'
import { invalidateAuthProfileMemo, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { isAvatarAction, sendAvatarFile, sendAvatarOp } from './_lib/profile/avatarHandler.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function profilePayload(p) {
  if (!p) return null
  return {
    role: p.role ?? null,
    name: p.name ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    login: p.login ?? null,
    club_id: p.club_id ?? null,
    offer_accepted_at: p.offer_accepted_at ?? null,
    offer_version: p.offer_version ?? null,
  }
}

async function acceptOffer(ctx, res, body) {
  if (!ctx.isSupervisor) {
    sendJson(res, 403, { error: 'Оферту принимает управляющий клуба' })
    return
  }
  if (!ctx.profile?.id) {
    sendJson(res, 403, { error: 'Профиль не найден' })
    return
  }
  const version = String(body?.version ?? '').trim()
  if (version !== OFFER_VERSION) {
    sendJson(res, 400, { error: 'Устаревшая версия оферты — обновите страницу' })
    return
  }
  const now = new Date().toISOString()
  const { data, error } = await ctx.supabaseAdmin
    .from('users')
    .update({ offer_accepted_at: now, offer_version: version })
    .eq('id', ctx.profile.id)
    .select('id, offer_accepted_at, offer_version')
    .maybeSingle()
  if (error) {
    console.warn('[offer-accept]', error.message)
    sendJson(res, 503, { error: 'Не удалось сохранить — попробуйте позже' })
    return
  }
  invalidateAuthProfileMemo(ctx.user?.id)
  sendJson(res, 200, {
    ok: true,
    offer_accepted_at: data?.offer_accepted_at ?? now,
    offer_version: data?.offer_version ?? version,
  })
}

async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (req.method === 'GET' && req.query?.avatar != null) {
    await sendAvatarFile(res, String(req.query.avatar))
    return
  }

  const ctx = await requireAuthUser(req, res)
  if (!ctx) return

  const p = ctx.profile
  if (req.method === 'POST') {
    const body = parseBody(req.body)
    const action = String(body?.action ?? '')
    if (action === 'offer-accept') {
      await acceptOffer(ctx, res, body)
      return
    }
    if (!p?.id || !isAvatarAction(action)) {
      sendJson(res, p?.id ? 400 : 403, { error: p?.id ? 'Неизвестное действие' : 'Профиль не найден' })
      return
    }
    await sendAvatarOp(res, ctx.supabaseAdmin, { table: 'users', side: 'staff', id: String(p.id) }, action, body)
    return
  }

  sendJson(res, 200, { profile: profilePayload(p) })
}

export default withSafeApiHandler(handler, { label: 'me-profile' })
