import { formatDateRu } from '../dateRu.js'
import { countedUsedTrainingsOnMembership } from '../membershipRules.js'

export function lastTrainingDateFromMap(map, clientId, loading) {
  const id = String(clientId ?? '')
  if (map && Object.prototype.hasOwnProperty.call(map, id)) {
    const d = map[id]
    return d ? formatDateRu(d) : '—'
  }
  return loading ? '…' : '—'
}

export function buildLastTrainingMap(trainings) {
  const out = {}
  for (const t of trainings ?? []) {
    const cid = String(t?.client_id ?? '')
    if (!cid) continue
    const d = String(t.date ?? t.created_at?.slice(0, 10) ?? '')
    if (!d) continue
    if (!out[cid] || d > out[cid]) out[cid] = d
  }
  return out
}

/** Остаток занятий: дневник + поле абонемента (если кэш тренировок пуст на устройстве админа). */
export function remainingTrainingsOnMembership(membership, clientTrainings) {
  if (!membership) return null
  const total = Number(membership.total_trainings ?? 0)
  if (!Number.isFinite(total)) return null
  const usedDiary = countedUsedTrainingsOnMembership(membership, clientTrainings)
  const usedStored = Number(membership.used_trainings ?? 0)
  const used = Math.max(usedDiary, Number.isFinite(usedStored) ? usedStored : 0)
  return Math.max(0, total - used)
}
