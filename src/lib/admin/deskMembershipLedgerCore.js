/**
 * Учёт абонов на desk-карточке ТЗ/АЗ (без React).
 * ТЗ: «действующий» только по календарю (пакет по сроку, занятия не лимит).
 * АЗ: как ПЗ — срок И остаток занятий.
 */

import { membershipCoversDate, pickUsableMembershipForDate } from '../membershipRules.js'
import { formatDateRu, parseFlexibleDateToIso, todayLocalIso } from '../dateRu.js'
import { MEMBERSHIP_SIGNAL_COLORS, MEMBERSHIP_EXPIRING_WITHIN_DAYS, membershipSignal } from '../clientListSignals.js'
import { normalizeDeskHall } from './deskHallClientsCore.js'
import { filterMembershipsByHall, normalizeMembershipHall } from '../membershipHallCore.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  DESK_PACKAGE_UNIT_DAYS,
  DESK_PACKAGE_UNIT_MONTHS,
  deskPackageEndByDuration,
  deskPackageEndIso,
  deskPackageStartIso,
  formatDeskPackageDurationLabel,
  formatDeskPackageMonthsLabel,
  inferDeskPackageDuration,
  inferDeskPackageMonths,
  isOneTimeTariffName,
  normalizeDeskPackageUnit,
} from './deskPackageDurationCore.js'

export {
  DESK_PACKAGE_MONTH_OPTIONS,
  deskPackageEndByDuration,
  deskPackageEndIso,
  deskPackageStartIso,
  formatDeskPackageDurationLabel,
  formatDeskPackageMonthsLabel,
  inferDeskPackageDuration,
  inferDeskPackageMonths,
  isOneTimeTariffName,
}

/**
 * Даты абона desk при импорте: end обязателен; start из Excel или из срока пакета.
 * @param {string} endIso
 * @param {string|null|undefined} startIso
 * @param {number|null|undefined} packageMonths
 * @returns {{ start_date: string, end_date: string } | null}
 */
export function resolveDeskMembershipDates(endIso, startIso, packageMonths) {
  const end = String(endIso ?? '').slice(0, 10)
  let start = String(startIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  const months = Math.trunc(Number(packageMonths))
  const hasMonths = Number.isFinite(months) && months > 0 && months <= 36
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    if (hasMonths) {
      start = deskPackageStartIso(end, months)
    } else {
      // без срока в Excel — пакет 1 месяц (не «−30 дней»)
      start = deskPackageStartIso(end, 1)
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  return { start_date: start, end_date: end }
}

/**
 * Подпись направления АЗ (Бокс, Техника дня…) по membership_type_id.
 * @param {string|null|undefined} membershipTypeId
 * @param {Array<{ id?: string, name?: string }>|null|undefined} azTypes
 */
export function deskAzDirectionLabel(membershipTypeId, azTypes) {
  const id = String(membershipTypeId ?? '').trim()
  if (!id) return '—'
  const list = Array.isArray(azTypes) ? azTypes : []
  const hit = list.find((t) => String(t?.id ?? '') === id)
  const name = String(hit?.name ?? '').trim()
  const code = String(hit?.code ?? '').trim()
  return name || code || '—'
}

/**
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 */
export function pickDeskActiveMembership(memberships, todayIso = todayLocalIso()) {
  const day = String(todayIso ?? '').slice(0, 10)
  const list = Array.isArray(memberships) ? memberships : []
  if (!day || !list.length) return null
  const covering = list.filter((m) => membershipCoversDate(m, day))
  if (!covering.length) return null
  return [...covering].sort((a, b) => {
    const endCmp = String(b.end_date ?? '').localeCompare(String(a.end_date ?? ''))
    if (endCmp) return endCmp
    return String(b.start_date ?? '').localeCompare(String(a.start_date ?? ''))
  })[0]
}

/**
 * Действующий абон зала: ТЗ — календарь; АЗ / ПЗ — срок + занятия.
 * При указанном hall смотрит только абоны этого зала (multi-hall).
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 * @param {unknown} [hall]
 */
export function pickHallActiveMembership(memberships, todayIso = todayLocalIso(), hall = null) {
  const want = normalizeMembershipHall(hall) || normalizeDeskHall(hall)
  const list = want ? filterMembershipsByHall(memberships, want) : memberships ?? []
  if (want === 'tz') return pickDeskActiveMembership(list, todayIso)
  return pickUsableMembershipForDate(list, String(todayIso ?? '').slice(0, 10))
}

/**
 * Сигнал списка: ТЗ — календарь; АЗ / ПЗ — занятия + срок.
 * При указанном hall — только абоны этого зала.
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 * @param {unknown} [hall]
 */
export function hallMembershipListSignal(memberships, todayIso = todayLocalIso(), hall = null) {
  const want = normalizeMembershipHall(hall) || normalizeDeskHall(hall)
  const list = want ? filterMembershipsByHall(memberships, want) : memberships ?? []
  if (want === 'tz') return deskMembershipSignal(list, todayIso)
  return membershipSignal(list, todayIso)
}

/**
 * Сигнал для списка Клиенты (вкладки ТЗ): по сроку, не по лимиту тренировок.
 * @param {object[]|null|undefined} memberships
 * @param {string} [todayIso]
 */
export function deskMembershipSignal(memberships, todayIso = todayLocalIso()) {
  const today = String(todayIso ?? '').slice(0, 10)
  const active = pickDeskActiveMembership(memberships, today)
  if (active) {
    const end = String(active.end_date ?? '').slice(0, 10)
    const pkg = formatDeskPackageDurationLabel(
      inferDeskPackageDuration(active.start_date, active.end_date),
    )
    const endD = new Date(`${end}T12:00:00`)
    const d0 = new Date(`${today}T12:00:00`)
    const daysLeft = Number.isFinite(endD - d0) ? Math.ceil((endD - d0) / 86400000) : null
    if (daysLeft != null && daysLeft <= MEMBERSHIP_EXPIRING_WITHIN_DAYS) {
      return {
        key: 'expiring',
        label: `≤${Math.max(0, daysLeft)}д · ${pkg}`,
        factLabel: end ? `до ${formatDateRu(end)}` : pkg,
        color: MEMBERSHIP_SIGNAL_COLORS.expiring,
      }
    }
    return {
      key: 'active',
      label: pkg,
      factLabel: end ? `до ${formatDateRu(end)}` : pkg,
      color: MEMBERSHIP_SIGNAL_COLORS.active,
    }
  }

  const list = Array.isArray(memberships) ? memberships : []
  if (!list.length) {
    return {
      key: 'no_membership',
      label: 'нет абонемента',
      factLabel: 'нет абонемента',
      color: MEMBERSHIP_SIGNAL_COLORS.no_membership,
    }
  }

  const future = list
    .filter((m) => String(m?.start_date ?? '').slice(0, 10) > today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
  if (future) {
    const startRu = formatDateRu(future.start_date)
    return {
      key: 'not_started',
      label: startRu ? `начнётся ${startRu}` : 'ждёт старт',
      factLabel: startRu ? `начнётся ${startRu}` : 'ждёт старт',
      color: MEMBERSHIP_SIGNAL_COLORS.not_started,
    }
  }

  const last = [...list].sort((a, b) =>
    String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')),
  )[0]
  const endRu = last?.end_date ? formatDateRu(last.end_date) : null
  return {
    key: 'expired',
    label: endRu ? `закончился ${endRu}` : 'закончился',
    factLabel: endRu ? `закончился ${endRu}` : 'закончился',
    color: MEMBERSHIP_SIGNAL_COLORS.expired,
  }
}

/**
 * @param {object} m
 * @param {string} [todayIso]
 * @param {string|null} [activeId]
 * @returns {'active'|'expired'|'future'|'other'}
 */
export function deskMembershipLedgerKind(m, todayIso = todayLocalIso(), activeId = null) {
  const day = String(todayIso ?? '').slice(0, 10)
  const id = String(m?.id ?? '')
  if (activeId && id && id === String(activeId)) return 'active'
  const start = String(m?.start_date ?? '').slice(0, 10)
  const end = String(m?.end_date ?? '').slice(0, 10)
  if (end && end < day) return 'expired'
  if (start && start > day) return 'future'
  if (membershipCoversDate(m, day)) return 'other'
  return 'other'
}

/**
 * @param {'active'|'expired'|'future'|'other'} kind
 */
export function deskMembershipLedgerKindLabel(kind) {
  if (kind === 'active') return 'действующий'
  if (kind === 'expired') return 'истёк'
  if (kind === 'future') return 'будущий'
  if (kind === 'other') return 'в периоде'
  return '—'
}

/**
 * @param {object[]|null|undefined} memberships
 */
export function sortDeskMembershipLedger(memberships) {
  return [...(memberships ?? [])].sort((a, b) => {
    const endCmp = String(b.end_date ?? '').localeCompare(String(a.end_date ?? ''))
    if (endCmp) return endCmp
    return String(b.start_date ?? '').localeCompare(String(a.start_date ?? ''))
  })
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseDeskPaidAmountInput(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * Кол-во занятий (АЗ). Пусто → null; иначе целое ≥ 0.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseDeskTotalTrainingsInput(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  return n
}

/**
 * @param {unknown} amount
 */
export function formatDeskPaidAmountRu(amount) {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`
}

/**
 * Черновик полей карточки абона (даты нормализуем в ISO).
 * @param {object|null|undefined} m
 */
export function deskMembershipRowDraft(m) {
  const start = parseFlexibleDateToIso(m?.start_date) || ''
  const end = parseFlexibleDateToIso(m?.end_date) || ''
  const duration = inferDeskPackageDuration(start, end)
  const total = Number(m?.total_trainings)
  return {
    id: String(m?.id ?? ''),
    package_unit: duration?.unit || DESK_PACKAGE_UNIT_MONTHS,
    package_count: duration != null ? String(duration.count) : '',
    package_months: duration?.unit === DESK_PACKAGE_UNIT_MONTHS && duration.count != null ? String(duration.count) : '',
    start_date: start,
    end_date: end,
    paid_amount: m?.paid_amount != null && m.paid_amount !== '' ? String(m.paid_amount) : '',
    membership_type_id: m?.membership_type_id ? String(m.membership_type_id) : '',
    total_trainings: Number.isFinite(total) && total > 0 ? String(Math.trunc(total)) : '',
  }
}

/**
 * Сигнатура списка абонов — чтобы не дёргать drafts при новом массиве с тем же содержимым.
 * @param {object[]|null|undefined} memberships
 */
export function deskMembershipsContentSig(memberships) {
  const list = Array.isArray(memberships) ? memberships : []
  return list
    .map((m) => {
      const id = String(m?.id ?? '')
      const start = parseFlexibleDateToIso(m?.start_date) || String(m?.start_date ?? '').slice(0, 10)
      const end = parseFlexibleDateToIso(m?.end_date) || String(m?.end_date ?? '').slice(0, 10)
      const paid = m?.paid_amount == null || m.paid_amount === '' ? '' : String(m.paid_amount)
      const type = m?.membership_type_id ? String(m.membership_type_id) : ''
      const total = Number(m?.total_trainings)
      const sessions = Number.isFinite(total) && total > 0 ? String(Math.trunc(total)) : ''
      return `${id}|${start}|${end}|${paid}|${type}|${sessions}`
    })
    .join(';')
}

/**
 * @param {object} a
 * @param {object} b
 */
export function deskMembershipDraftEquals(a, b) {
  if (!a || !b) return false
  return (
    String(a.start_date ?? '') === String(b.start_date ?? '') &&
    String(a.end_date ?? '') === String(b.end_date ?? '') &&
    String(a.paid_amount ?? '') === String(b.paid_amount ?? '') &&
    String(a.membership_type_id ?? '') === String(b.membership_type_id ?? '') &&
    String(a.package_unit ?? '') === String(b.package_unit ?? '') &&
    String(a.package_count ?? '') === String(b.package_count ?? '') &&
    String(a.package_months ?? '') === String(b.package_months ?? '') &&
    String(a.total_trainings ?? '') === String(b.total_trainings ?? '')
  )
}

/**
 * Срок целиком (единица + число) — один шаг, без промежуточного сброса на 1.
 * @param {object} cur
 * @param {unknown} unit
 * @param {unknown} count
 */
export function applyDeskMembershipDraftDuration(cur, unit, count) {
  const nextUnit = normalizeDeskPackageUnit(unit)
  const nextCount = count == null || count === '' ? '' : String(count)
  const next = { ...cur, package_unit: nextUnit, package_count: nextCount }
  const n = Number(nextCount)
  if (next.start_date && Number.isFinite(n) && n > 0) {
    const end = deskPackageEndByDuration(next.start_date, nextUnit, n)
    if (end) next.end_date = end
  }
  next.package_months =
    nextUnit === DESK_PACKAGE_UNIT_MONTHS && Number.isFinite(n) && n > 0 ? String(n) : ''
  return next
}

/**
 * Пакет меняет конец; правки дат свободны (пакет только подстраивается).
 * @param {object} cur
 * @param {string} key
 * @param {string} value
 */
export function applyDeskMembershipDraftField(cur, key, value) {
  if (key === 'package_unit' || key === 'package_count') {
    const unit = key === 'package_unit' ? value : cur.package_unit
    const count = key === 'package_count' ? value : key === 'package_unit' ? '1' : cur.package_count
    return applyDeskMembershipDraftDuration(cur, unit, count)
  }
  const next = { ...cur, [key]: value }
  if (key === 'package_months' && value) {
    return applyDeskMembershipDraftDuration(next, DESK_PACKAGE_UNIT_MONTHS, value)
  }
  if (key === 'end_date' || key === 'start_date') {
    const start = parseFlexibleDateToIso(next.start_date) || String(next.start_date ?? '').slice(0, 10)
    const end = parseFlexibleDateToIso(next.end_date) || String(next.end_date ?? '').slice(0, 10)
    if (key === 'start_date') next.start_date = start
    if (key === 'end_date') next.end_date = end
    const wasOneDay =
      (normalizeDeskPackageUnit(cur.package_unit) === DESK_PACKAGE_UNIT_DAYS &&
        Math.trunc(Number(cur.package_count)) === 1) ||
      String(cur.start_date ?? '').slice(0, 10) === String(cur.end_date ?? '').slice(0, 10)
    if (key === 'start_date' && wasOneDay && start) {
      next.end_date = start
      next.package_unit = DESK_PACKAGE_UNIT_DAYS
      next.package_count = '1'
      next.package_months = ''
      return next
    }
    const inferred = inferDeskPackageDuration(next.start_date, next.end_date)
    if (inferred) {
      next.package_unit = inferred.unit
      next.package_count = String(inferred.count)
      next.package_months =
        inferred.unit === DESK_PACKAGE_UNIT_MONTHS ? String(inferred.count) : ''
    }
  }
  return next
}
