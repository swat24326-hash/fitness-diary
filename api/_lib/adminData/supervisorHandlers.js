import { sendJson } from '../adminSupabase.js'
import { assertCanCreateSupervisor } from '../../../src/lib/admin/supervisorAccessCore.js'
import { USERS_SUPERVISOR_ROLES } from '../../../src/lib/userRoleConstants.js'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

/**
 * POST admin-data?action=create-supervisor — только админ сети.
 * Один активный управляющий на клуб.
 */
export async function handleCreateSupervisorPost(ctx, res, body) {
  const { supabaseAdmin } = ctx

  const name = String(body.name ?? '').trim()
  const login = String(body.login ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim() || null
  const password = String(body.password ?? '')
  let email = String(body.email ?? '').trim()
  const rawClub = body.club_id != null ? String(body.club_id).trim() : ''
  const club_id = rawClub && UUID_RE.test(rawClub) ? rawClub : null

  if (!name || !login || !password) {
    sendJson(res, 400, { error: 'Укажите имя, логин и пароль' })
    return
  }
  if (password.length < 6) {
    sendJson(res, 400, { error: 'Пароль не короче 6 символов' })
    return
  }
  if (!club_id) {
    sendJson(res, 400, { error: 'Выберите клуб — управляющий привязан к одному клубу' })
    return
  }
  if (!email) {
    email = `${login}@club.local`
  }

  const { data: existingSupervisors, error: listErr } = await supabaseAdmin
    .from('users')
    .select('id, name, login, is_active')
    .eq('club_id', club_id)
    .in('role', [...USERS_SUPERVISOR_ROLES])

  if (listErr) {
    sendJson(res, 400, { error: listErr.message })
    return
  }

  const activeCount = (existingSupervisors ?? []).filter((u) => u.is_active !== false).length
  const gate = assertCanCreateSupervisor(activeCount)
  if (!gate.ok) {
    sendJson(res, 409, { error: gate.error })
    return
  }

  const { data: created, error: auErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (auErr || !created?.user) {
    sendJson(res, 400, { error: auErr?.message ?? 'Не удалось создать пользователя в Auth' })
    return
  }

  const uid = created.user.id

  const insertRow = {
    id: uid,
    name,
    phone,
    email,
    login,
    role: 'supervisor',
    password_hash: 'supabase-auth',
    is_active: true,
    club_id,
  }

  const { error: insErr } = await supabaseAdmin.from('users').insert(insertRow)

  if (insErr) {
    await supabaseAdmin.auth.admin.deleteUser(uid)
    sendJson(res, 400, { error: insErr.message })
    return
  }

  sendJson(res, 200, { ok: true, id: uid, supervisor: insertRow })
}
