import {
  inactiveMembershipDetail,
  membershipHasRemaining,
  pickUsableMembershipForDate,
} from './membershipRules.js'
import { formatDateRu } from './dateRu.js'

/**
 * Окно «Истекает»: осталось дней до конца абона (включительно, 0 = сегодня).
 * Один источник для списков тренера/админа, ТЗ-календаря и SMS-отметок.
 */
export const MEMBERSHIP_EXPIRING_WITHIN_DAYS = 5

/** Цвета точки в списках (админ / дашборд тренера — inline). */
export const MEMBERSHIP_SIGNAL_COLORS = {
  active: '#22c55e',
  expiring: '#eab308',
  expired_remaining: '#f59e0b',
  limit0: '#f87171',
  none: '#f87171',
  no_membership: '#f87171',
  expired: '#f87171',
  depleted: '#f87171',
  /** Ждёт старт — нейтральный, не «авария». */
  not_started: '#e8ece9',
}

/**
 * Модификатор CSS `.td-client-dot--*`.
 * Красный квадрат общий для «нужно действие»; ждёт старт — свой круг.
 */
export function membershipSignalDotClass(key) {
  const k = String(key ?? '')
  if (k === 'expired_remaining') return 'expired_recent'
  if (k === 'depleted' || k === 'expired' || k === 'no_membership' || k === 'none') return 'none'
  return k || 'none'
}

export function pickExpiredMembershipWithRemaining(list, todayIso) {
  const d = String(todayIso ?? '')
  const candidates = (list ?? []).filter((m) => String(m?.end_date ?? '') < d && membershipHasRemaining(m))
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/**
 * Сигнал абонемента для списка клиентов: точка + подписи.
 * @returns {{
 *   key: string,
 *   label: string,
 *   factLabel: string | null,
 *   color: string,
 * }}
 */
export function membershipSignal(list, today) {
  const active = pickUsableMembershipForDate(list ?? [], today)
  if (!active) {
    const detail = inactiveMembershipDetail(list, today)

    // Куплен следующий — не красный «нет активного».
    if (detail.reason === 'not_started') {
      const startRu = detail.membershipStartDate ? formatDateRu(detail.membershipStartDate) : null
      const factLabel = startRu ? `начнётся ${startRu}` : 'ждёт старт'
      return {
        key: 'not_started',
        label: factLabel,
        factLabel,
        color: MEMBERSHIP_SIGNAL_COLORS.not_started,
      }
    }

    const expiredLeft = pickExpiredMembershipWithRemaining(list, today)
    if (expiredLeft) {
      const total = Number(expiredLeft.total_trainings ?? 0)
      const used = Number(expiredLeft.used_trainings ?? 0)
      const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
      const endRu = formatDateRu(expiredLeft.end_date)
      return {
        key: 'expired_remaining',
        label: `срок истёк, осталось ${remaining ?? '—'}`,
        factLabel: endRu ? `истёк ${endRu}` : 'срок истёк',
        color: MEMBERSHIP_SIGNAL_COLORS.expired_remaining,
      }
    }

    if (detail.reason === 'depleted') {
      const factLabel = 'лимит исчерпан'
      return {
        key: 'depleted',
        label: String(detail.inactiveDetail ?? '').trim() || factLabel,
        factLabel,
        color: MEMBERSHIP_SIGNAL_COLORS.depleted,
      }
    }

    if (detail.reason === 'no_membership') {
      return {
        key: 'no_membership',
        label: 'нет абонемента',
        factLabel: 'нет абонемента',
        color: MEMBERSHIP_SIGNAL_COLORS.no_membership,
      }
    }

    const endRu = detail.membershipEndDate ? formatDateRu(detail.membershipEndDate) : null
    const factLabel = endRu ? `закончился ${endRu}` : 'закончился'
    return {
      key: 'expired',
      label: String(detail.inactiveDetail ?? '').trim() || factLabel,
      factLabel,
      color: MEMBERSHIP_SIGNAL_COLORS.expired,
    }
  }

  const total = Number(active.total_trainings ?? 0)
  const used = Number(active.used_trainings ?? 0)
  const remaining = Number.isFinite(total) && Number.isFinite(used) ? Math.max(0, total - used) : null
  if (remaining === 0) {
    return {
      key: 'limit0',
      label: 'лимит 0',
      factLabel: null,
      color: MEMBERSHIP_SIGNAL_COLORS.limit0,
    }
  }

  const end = new Date(active.end_date)
  const d0 = new Date(today)
  const days = Math.ceil((end - d0) / 86400000)
  if (days <= MEMBERSHIP_EXPIRING_WITHIN_DAYS) {
    return {
      key: 'expiring',
      label: `≤${days}д`,
      factLabel: null,
      color: MEMBERSHIP_SIGNAL_COLORS.expiring,
    }
  }
  return {
    key: 'active',
    label: 'активен',
    factLabel: null,
    color: MEMBERSHIP_SIGNAL_COLORS.active,
  }
}

export function formatLastTrainingDate(isoOrDash) {
  if (!isoOrDash || isoOrDash === '—') return '—'
  return formatDateRu(isoOrDash)
}
