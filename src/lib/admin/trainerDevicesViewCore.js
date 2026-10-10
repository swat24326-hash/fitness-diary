/**
 * Группировка устройств тренеров для экрана админа: сначала ждущие, затем по тренеру.
 * @param {Array<{ id: string, user_id: string, status: string, trainer_name?: string | null, created_at?: string }>} devices
 */
export function groupTrainerDevices(devices) {
  const list = Array.isArray(devices) ? devices : []
  const pending = list.filter((d) => d.status === 'pending')
  const byTrainer = new Map()
  for (const d of list) {
    if (d.status !== 'approved') continue
    const key = String(d.user_id)
    if (!byTrainer.has(key)) byTrainer.set(key, { userId: key, name: d.trainer_name || 'Без имени', devices: [] })
    byTrainer.get(key).devices.push(d)
  }
  const approvedCountByUser = new Map([...byTrainer].map(([k, v]) => [k, v.devices.length]))
  return {
    pending: pending.map((d) => ({ ...d, hasApproved: (approvedCountByUser.get(String(d.user_id)) ?? 0) > 0 })),
    trainers: [...byTrainer.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}
