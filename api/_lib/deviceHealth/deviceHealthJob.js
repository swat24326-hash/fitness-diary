/**
 * Центр сбоев: cron на ВМ каждые 5 минут (scripts/device-health-vm.mjs).
 * 1) server_no_pull и снятие проблем у замолчавших устройств; 2) push админам сети по критичным сбоям.
 */
import { isAdminByRole } from '../../../src/lib/admin/adminRoleCore.js'
import { clubOpsMinutesNow } from '../clientPortal/clientReminderCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { isWebPushConfigured, sendPushToUser } from '../webPushCore.js'
import { activeDeviceCodes, buildDevicePushPayload, planDevicePush, planDeviceServerUpdate } from './deviceHealthCore.js'
import { createDeviceHealthStore } from './deviceHealthStore.js'

const SCAN_DAYS = 2
const MISSING_SCHEMA = /does not exist|device_health/i

async function loadAdmins(db) {
  const { data, error } = await db.from('users').select('id, role, is_active').in('role', ['admin', 'администратор'])
  if (error) throw new Error(error.message)
  return (data ?? []).filter((u) => isAdminByRole(u.role) && u.is_active !== false).map((u) => String(u.id))
}

async function loadNames(db, userIds) {
  if (!userIds.length) return new Map()
  const { data } = await db.from('users').select('id, name').in('id', userIds)
  return new Map((data ?? []).map((u) => [String(u.id), u.name]))
}

/**
 * @param {{ db?: object, store?: object, now?: Date, send?: typeof sendPushToUser, pushReady?: boolean, dryRun?: boolean }} [opts]
 */
export async function runDeviceHealthJob({
  db = createServiceDataClient(),
  store,
  now = new Date(),
  send = sendPushToUser,
  pushReady = isWebPushConfigured(),
  dryRun = false,
} = {}) {
  const st = store ?? createDeviceHealthStore(db)
  const nowMs = now.getTime()
  const ops = clubOpsMinutesNow(now)
  const { rows, error } = await st.listRecent(new Date(nowMs - SCAN_DAYS * 86_400_000).toISOString())
  if (error) {
    if (MISSING_SCHEMA.test(error)) return { skipped: 'migration_pending' }
    throw new Error(error)
  }

  const result = { scanned: rows.length, updated: 0, with_problems: 0, pushes: 0 }
  const live = []
  for (const row of rows) {
    const patch = planDeviceServerUpdate(row, nowMs, ops)
    const next = patch ? { ...row, ...patch } : row
    if (patch) {
      result.updated += 1
      if (!dryRun) {
        const r = await st.update(row.id, patch)
        if (r.error) console.warn('[device-health] job update:', r.error)
      }
    }
    if (activeDeviceCodes(next).length) result.with_problems += 1
    const plan = planDevicePush(next, nowMs, ops)
    if (plan) live.push({ row: next, plan })
  }
  result.pushes = live.length
  if (dryRun || !live.length) return dryRun ? { dry_run: true, ...result } : result
  if (!pushReady) return { ...result, skipped: 'vapid_not_configured' }

  const admins = await loadAdmins(db)
  const names = await loadNames(db, [...new Set(live.map((x) => String(x.row.user_id)))])
  for (const { row, plan } of live) {
    const payload = buildDevicePushPayload(row, names.get(String(row.user_id)), plan)
    await Promise.allSettled(admins.map((id) => send(db, id, payload)))
    const r = await st.update(row.id, { notified_at: new Date(nowMs).toISOString(), notified_codes: plan.codes })
    if (r.error) console.warn('[device-health] job notified:', r.error)
  }
  return result
}
