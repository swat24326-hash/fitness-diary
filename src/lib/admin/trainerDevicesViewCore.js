/**
 * Группировка устройств тренеров для экрана админа: сначала ждущие, затем по тренеру.
 * kind 'coach' — личный телефон (/coach): у тренера один, «Разрешить» сам заменяет прежний, места планшета не занимает.
 * @param {Array<{ id: string, user_id: string, status: string, kind?: string, trainer_name?: string | null, created_at?: string }>} devices
 */
export function groupTrainerDevices(devices) {
  const list = Array.isArray(devices) ? devices : []
  const kindOf = (d) => (d.kind === 'coach' ? 'coach' : 'tablet')
  const pending = list.filter((d) => d.status === 'pending')
  const byTrainer = new Map()
  const approvedByUserKind = new Set()
  for (const d of list) {
    if (d.status !== 'approved') continue
    const key = String(d.user_id)
    approvedByUserKind.add(`${key}:${kindOf(d)}`)
    if (!byTrainer.has(key)) byTrainer.set(key, { userId: key, name: d.trainer_name || 'Без имени', devices: [] })
    byTrainer.get(key).devices.push(d)
  }
  return {
    pending: pending.map((d) => ({
      ...d,
      isCoach: kindOf(d) === 'coach',
      hasApproved: approvedByUserKind.has(`${String(d.user_id)}:${kindOf(d)}`),
    })),
    trainers: [...byTrainer.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}
