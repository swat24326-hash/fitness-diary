import { isAdminByRole } from '../../src/lib/admin/adminRoleCore.js'
import { createServiceDataClient } from './pgRest/serviceClient.js'
import { sendPushToUser } from './webPushCore.js'

async function pushAdmins(trainerUserId, build) {
  const db = createServiceDataClient()
  const [{ data: staff }, { data: trainer }] = await Promise.all([
    db.from('users').select('id, role, is_active').in('role', ['admin', 'администратор']),
    db.from('users').select('name').eq('id', trainerUserId).maybeSingle(),
  ])
  const admins = (staff ?? []).filter((u) => isAdminByRole(u.role) && u.is_active !== false)
  const payload = build(String(trainer?.name ?? 'Тренер').trim())
  await Promise.allSettled(admins.map((a) => sendPushToUser(db, String(a.id), payload)))
}

/** Push всем админам: новое устройство тренера ждёт «Разрешить». Сбой не мешает ответу на вход. */
export function notifyAdminsPendingDevice(trainerUserId, deviceLabel) {
  return pushAdmins(trainerUserId, (name) => ({
    title: 'Новое устройство тренера',
    body: `${name}: ${deviceLabel} ждёт разрешения`,
    url: '/admin/devices',
    tag: `device-pending-${trainerUserId}`,
  }))
}

/**
 * Push всем админам: устройство разрешено без них (первый телефон тренера) —
 * чтобы чужой вход не прошёл незамеченным.
 */
export function notifyAdminsDeviceAdded(trainerUserId, deviceLabel, how) {
  return pushAdmins(trainerUserId, (name) => ({
    title: 'Тренер подключил устройство',
    body: `${name}: ${deviceLabel} (${how}). Не узнаёте — «Отозвать»`,
    url: '/admin/devices',
    tag: `device-added-${trainerUserId}`,
  }))
}
