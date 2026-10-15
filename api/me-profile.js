/**
 * Профиль текущего пользователя из public.users (обход ERR_CONNECTION_RESET).
 * GET ?avatar=<ключ> — картинка фото профиля без входа (ключ выдают только списки переписки; avatarHandler.js).
 * POST { action: 'avatar-get' | 'avatar-set' (data — base64 JPEG) | 'avatar-delete' } — своё фото профиля.
 */
import { requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
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
    if (!p?.id || !isAvatarAction(body?.action)) {
      sendJson(res, p?.id ? 400 : 403, { error: p?.id ? 'Неизвестное действие' : 'Профиль не найден' })
      return
    }
    await sendAvatarOp(res, ctx.supabaseAdmin, { table: 'users', side: 'staff', id: String(p.id) }, body.action, body)
    return
  }

  sendJson(res, 200, {
    profile: p
      ? {
          role: p.role ?? null,
          name: p.name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          login: p.login ?? null,
          club_id: p.club_id ?? null,
        }
      : null,
  })
}

export default withSafeApiHandler(handler, { label: 'me-profile' })
