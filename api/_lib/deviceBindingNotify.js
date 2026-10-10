import { isAdminByRole } from '../../src/lib/admin/adminRoleCore.js'
import { createServiceDataClient } from './pgRest/serviceClient.js'
import { sendPushToUser } from './webPushCore.js'

/** Push всем админам: новое устройство тренера ждёт «Разрешить». Сбой не мешает ответу на вход. */
export async function notifyAdminsPendingDevice(trainerUserId, deviceLabel) {
  const db = createServiceDataClient()
  const [{ data: staff }, { data: trainer }] = await Promise.all([
    db.from('users').select('id, role, is_active').in('role', ['admin', 'администратор']),
    db.from('users').select('name').eq('id', trainerUserId).maybeSingle(),
  ])
  const admins = (staff ?? []).filter((u) => isAdminByRole(u.role) && u.is_active !== false)
  const payload = {
    title: 'Новое устройство тренера',
    body: `${String(trainer?.name ?? 'Тренер').trim()}: ${deviceLabel} ждёт разрешения`,
    url: '/admin/devices',
    tag: `device-pending-${trainerUserId}`,
  }
  await Promise.allSettled(admins.map((a) => sendPushToUser(db, String(a.id), payload)))
}
