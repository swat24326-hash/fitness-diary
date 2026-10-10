import { sendJson } from './adminSupabase.js'
import { authSessionsStore } from './authSessionsStore.js'
import { deviceBindingNow } from './deviceBindingGate.js'
import { isDeviceBoundRole, planAdminDeviceAction } from './deviceBindingCore.js'
import { userDevicesStore } from './userDevicesStore.js'

/**
 * GET admin-data?action=trainer-devices — ждущие и разрешённые устройства тренеров (только админ).
 * @param {{ supabaseAdmin: object }} ctx
 */
export async function handleTrainerDevicesGet(ctx, res, store = userDevicesStore) {
  const { rows, error } = await store.listForAdmin()
  if (error) {
    sendJson(res, 500, { error: 'Не удалось загрузить устройства' })
    return
  }
  const userIds = [...new Set(rows.map((r) => String(r.user_id)))]
  const { data: users } = userIds.length
    ? await ctx.supabaseAdmin.from('users').select('id, name, login, club_id, role').in('id', userIds)
    : { data: [] }
  const byId = new Map((users ?? []).map((u) => [String(u.id), u]))
  const devices = rows
    .filter((r) => isDeviceBoundRole(byId.get(String(r.user_id))?.role))
    .map((r) => {
      const u = byId.get(String(r.user_id))
      return { ...r, trainer_name: u?.name ?? null, trainer_login: u?.login ?? null, club_id: u?.club_id ?? null }
    })
  sendJson(res, 200, { devices, binding_active: deviceBindingNow().active })
}

/**
 * POST admin-data?action=trainer-device-set { id, op: approve | replace | revoke }.
 * Отозванные устройства теряют сессии сразу (продление откажет, access живёт до часа).
 * @param {{ user: { id: string } }} ctx
 */
export async function handleTrainerDeviceSetPost(ctx, res, body, deps = {}) {
  const store = deps.store ?? userDevicesStore
  const sessions = deps.sessions ?? authSessionsStore
  const id = String(body?.id ?? '').trim()
  const op = String(body?.op ?? '').trim()
  const { row, error } = id ? await store.get(id) : { row: null, error: null }
  if (error) {
    sendJson(res, 500, { error: 'Не удалось загрузить устройство' })
    return
  }
  if (!row) {
    sendJson(res, 404, { error: 'Устройство не найдено' })
    return
  }
  const { rows: userDevices, error: listErr } = await store.listForUser(String(row.user_id))
  if (listErr) {
    sendJson(res, 500, { error: 'Не удалось загрузить устройства тренера' })
    return
  }
  const plan = planAdminDeviceAction(/** @type {any} */ (op), row, userDevices)
  if ('error' in plan) {
    sendJson(res, 400, { error: plan.error })
    return
  }
  for (const u of plan.updates) {
    const { error: updErr } = await store.setStatus(u.id, u.status, ctx.user?.id ?? null)
    if (updErr) {
      sendJson(res, 500, { error: 'Не удалось сохранить решение' })
      return
    }
  }
  const { error: revokeErr } = await sessions.revokeForDevices(String(row.user_id), plan.revokeDeviceIds)
  if (revokeErr) console.warn('[trainer-devices] revoke sessions:', revokeErr)
  sendJson(res, 200, { ok: true, updated: plan.updates.length })
}
