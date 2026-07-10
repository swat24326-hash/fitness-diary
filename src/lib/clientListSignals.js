import { membershipHasRemaining, pickUsableMembershipForDate } from './membershipRules.js'
import { formatDateRu } from './dateRu.js'

export function pickExpiredMembershipWithRemaining(list, todayIso) {
  const d = String(todayIso ?? '')
  const candidates = (list ?? []).filter((m) => String(m?.end_date ?? '') < d && membershipHasRemaining(m))
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/** @returns {{ key: string, label: string }} */
export function membershipSignal(list, today) {
  const active = pickUsableMembershipForDate(list ?? [], today)
  if (!active) {
    const expiredLeft = pickExpiredMembershipWithRemaining(list, today)
    if (expiredLeft) {
      const total = Number(expiredLeft.total_trainings ?? 0)
      const used = Number(expiredLeft.used_trainings ?? 0)
      const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
      return { key: 'expired_remaining', label: `срок истёк, осталось ${remaining ?? '—'}` }
    }
    return { key: 'none', label: 'нет активного' }
  }

  const total = Number(active.total_trainings ?? 0)
  const used = Number(active.used_trainings ?? 0)
  const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
  if (remaining === 0) return { key: 'limit0', label: 'лимит 0' }

  const end = new Date(active.end_date)
  const d0 = new Date(today)
  const days = Math.ceil((end - d0) / 86400000)
  if (days <= 3) return { key: 'expiring', label: `≤${days}д` }
  return { key: 'active', label: 'активен' }
}

export function formatLastTrainingDate(isoOrDash) {
  if (!isoOrDash || isoOrDash === '—') return '—'
  return formatDateRu(isoOrDash)
}
