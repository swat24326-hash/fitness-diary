/**
 * Профиль текущего пользователя из public.users (обход ERR_CONNECTION_RESET).
 */
import { requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
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

  const ctx = await requireAuthUser(req, res)
  if (!ctx) return

  const p = ctx.profile
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
