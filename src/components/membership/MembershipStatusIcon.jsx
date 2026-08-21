/**
 * Визуальный статус абонемента в таблице (иконка + kind).
 */

import {
  isMembershipTotalBroken,
} from '../../lib/membership/membershipTotalGuardCore.js'

export function membershipDateWindowOk(m, todayIso) {
  const s = m?.start_date
  const e = m?.end_date
  if (!s || !e) return false
  return String(s) <= String(todayIso) && String(e) >= String(todayIso)
}

export function membershipRemainingOk(m) {
  const total = Number(m?.total_trainings ?? 0)
  const used = Number(m?.used_trainings ?? 0)
  return Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
}

/**
 * @param {object} m
 * @param {string} todayIso
 * @param {number} [usedEffective]
 */
export function membershipVisualKind(m, todayIso, usedEffective) {
  const total = Number(m?.total_trainings ?? 0)
  const used =
    usedEffective != null ? Number(usedEffective) : Number(m?.used_trainings ?? 0)
  if (isMembershipTotalBroken({ totalTrainings: total, usedEffective: used })) {
    return 'broken_total'
  }
  const windowOk = membershipDateWindowOk(m, todayIso)
  const remainingOk = membershipRemainingOk(m)
  if (windowOk && remainingOk) return 'active'
  if (windowOk && !(Number.isFinite(total) && total > 0)) return 'empty_package'
  if (windowOk && !remainingOk) return 'depleted'
  return 'no_window'
}

export function membershipVisualMeta(kind) {
  if (kind === 'active') {
    return {
      label: 'Действует',
      title: 'Действует: срок активен и есть остаток тренировок',
    }
  }
  if (kind === 'broken_total') {
    return {
      label: 'Лимит меньше списанных',
      title: 'Лимит занятий меньше уже списанных — исправьте число тренировок в абонементе',
    }
  }
  if (kind === 'empty_package') {
    return {
      label: 'Нет занятий в пакете',
      title: 'Срок ещё действует, но число тренировок не задано (0) — часто авто-заглушка',
    }
  }
  if (kind === 'depleted') {
    return {
      label: 'Тренировки закончились',
      title: 'Тренировки закончились: по сроку ещё можно, но лимит исчерпан',
    }
  }
  return {
    label: 'Нет действующего срока',
    title: 'Нет действующего срока: даты не заданы, ещё не начался или уже истёк',
  }
}

export function MembershipStatusIcon({ kind }) {
  const meta = membershipVisualMeta(kind)
  const common = { role: 'img', 'aria-label': meta.label, title: meta.title }
  if (kind === 'active') {
    return (
      <svg {...common} width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="6" fill="#22c55e" />
      </svg>
    )
  }
  if (kind === 'broken_total') {
    return (
      <svg {...common} width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 3.5 L15.5 14.5 H2.5 Z" fill="#f59e0b" />
        <rect x="8.25" y="7" width="1.5" height="4" rx="0.5" fill="#111" />
        <circle cx="9" cy="13" r="0.9" fill="#111" />
      </svg>
    )
  }
  if (kind === 'depleted' || kind === 'empty_package') {
    return (
      <svg {...common} width="18" height="18" viewBox="0 0 18 18">
        <rect x="4" y="4" width="10" height="10" rx="2" fill="#ef4444" />
      </svg>
    )
  }
  return (
    <svg {...common} width="18" height="18" viewBox="0 0 18 18">
      <path d="M9 3.5 L15.5 14.5 H2.5 Z" fill="#ef4444" />
    </svg>
  )
}
