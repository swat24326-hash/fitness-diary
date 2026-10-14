/**
 * admin-data?action=device-health — центр сбоев устройств (docs/DEVICE_HEALTH.md).
 * POST — отчёт планшета о себе (тренер / управляющий, только своё устройство из x-device-id);
 * GET — список для админа сети; POST device-health-resolve { id } — «Решено».
 */
import { sendJson } from '../adminSupabase.js'
import { deviceIdFromHeaders, deviceLabelFromHeaders } from '../deviceBindingGate.js'
import { applyDeviceReport, sanitizeDeviceReport, toDeviceHealthView, activeDeviceCodes } from './deviceHealthCore.js'
import { createDeviceHealthStore } from './deviceHealthStore.js'

const LIST_DAYS = 30

/** @param {{ user: { id: string }, profile: object | null, isTrainer: boolean, isSupervisor: boolean }} ctx */
export async function handleDeviceHealthReportPost(ctx, req, res, body, deps = {}) {
  if (!ctx.isTrainer && !ctx.isSupervisor) {
    sendJson(res, 403, { error: 'Отчёт об устройстве — только для тренера' })
    return
  }
  const deviceId = deviceIdFromHeaders(req.headers)
  if (!deviceId) {
    sendJson(res, 400, { error: 'Нет номера устройства — обновите приложение' })
    return
  }
  const store = deps.store ?? createDeviceHealthStore()
  const userId = String(ctx.user.id)
  const prev = await store.get(userId, deviceId)
  if (prev.error) {
    sendJson(res, 503, { error: 'Сервер занят — повторите позже' })
    return
  }
  const row = applyDeviceReport(prev.data, sanitizeDeviceReport(body), {
    userId,
    deviceId,
    clubId: String(ctx.profile?.club_id ?? '').trim() || null,
    label: deviceLabelFromHeaders(req.headers),
    now: deps.now ?? Date.now(),
  })
  if (row) {
    const saved = await store.upsert(row)
    if (saved.error) {
      console.warn('[device-health] report:', saved.error)
      sendJson(res, 503, { error: 'Сервер занят — повторите позже' })
      return
    }
  }
  sendJson(res, 200, { ok: true })
}

/** GET для админа: устройства с отчётом за 30 дней, имена тренеров и клубов. */
export async function handleDeviceHealthGet(ctx, res, deps = {}) {
  const store = deps.store ?? createDeviceHealthStore()
  const now = deps.now ?? Date.now()
  const { rows, error } = await store.listRecent(new Date(now - LIST_DAYS * 86_400_000).toISOString())
  if (error) {
    sendJson(res, 500, { error: 'Не удалось загрузить устройства' })
    return
  }
  const userIds = [...new Set(rows.map((r) => String(r.user_id)))]
  const clubIds = [...new Set(rows.map((r) => String(r.club_id ?? '')).filter(Boolean))]
  const [users, clubs] = await Promise.all([
    userIds.length ? ctx.supabaseAdmin.from('users').select('id, name').in('id', userIds) : { data: [] },
    clubIds.length ? ctx.supabaseAdmin.from('clubs').select('id, name').in('id', clubIds) : { data: [] },
  ])
  const userName = new Map((users.data ?? []).map((u) => [String(u.id), u.name]))
  const clubName = new Map((clubs.data ?? []).map((c) => [String(c.id), c.name]))
  const devices = rows.map((r) =>
    toDeviceHealthView(r, { trainerName: userName.get(String(r.user_id)), clubName: clubName.get(String(r.club_id ?? '')) }),
  )
  sendJson(res, 200, { devices, attention: devices.filter((d) => d.needs_attention).length })
}

/** POST device-health-resolve { id } — админ отметил «Решено» для текущего набора проблем. */
export async function handleDeviceHealthResolvePost(ctx, res, body, deps = {}) {
  const store = deps.store ?? createDeviceHealthStore()
  const id = String(body?.id ?? '').trim()
  const { rows, error } = id ? await store.listById(id) : { rows: [], error: null }
  if (error) {
    sendJson(res, 500, { error: 'Не удалось загрузить устройство' })
    return
  }
  const row = rows[0]
  if (!row) {
    sendJson(res, 404, { error: 'Устройство не найдено' })
    return
  }
  const saved = await store.update(row.id, {
    resolved_at: new Date(deps.now ?? Date.now()).toISOString(),
    resolved_codes: activeDeviceCodes(row),
    resolved_by: String(ctx.user?.id ?? '') || null,
  })
  if (saved.error) {
    sendJson(res, 500, { error: 'Не удалось сохранить' })
    return
  }
  sendJson(res, 200, { ok: true })
}
