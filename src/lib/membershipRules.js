import { formatDateRu, todayLocalIso, addDaysToIso } from './dateRu.js'

export function membershipCoversDate(m, dateIso) {
  if (!m || !dateIso) return false
  const d = String(dateIso)
  const s = m.start_date
  const e = m.end_date
  if (!s || !e) return false
  return String(s) <= d && String(e) >= d
}

export function membershipHasRemaining(m) {
  const total = Number(m?.total_trainings ?? 0)
  const used = Number(m?.used_trainings ?? 0)
  return Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
}

/**
 * Пакет без лимита занятий (`total_trainings` не > 0): lite ПЗ / ТЗ-календарь / ошибочный 0/0.
 * Не путать с исчерпанным лимитом (total > 0 и used ≥ total).
 * @param {object|null|undefined} m
 */
export function isCalendarUnlimitedMembership(m) {
  const total = Number(m?.total_trainings ?? 0)
  return !(Number.isFinite(total) && total > 0)
}

/**
 * Срок кроет дату, лимит занятий исчерпан (только пакеты с total > 0).
 * @param {object|null|undefined} m
 * @param {string} dateIso
 */
export function membershipIsSessionDepletedOn(m, dateIso) {
  if (!m || isCalendarUnlimitedMembership(m)) return false
  return membershipCoversDate(m, dateIso) && !membershipHasRemaining(m)
}

/**
 * Есть абон по сроку без лимита занятий на дату.
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function hasCalendarUnlimitedCovering(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return false
  return (memberships ?? []).some(
    (m) => membershipCoversDate(m, d) && isCalendarUnlimitedMembership(m),
  )
}

/**
 * Пакет с лимитом тренировок: срок ещё кроет дату, но остаток 0.
 * Не путать с ТЗ/календарём (`total_trainings = 0` — без лимита занятий).
 * Такие клиенты — горячие для продления, не «холодный» хвост «Не активные» alone.
 *
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function isMembershipDepletedInPeriod(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return (memberships ?? []).some((m) => membershipIsSessionDepletedOn(m, d))
}

/**
 * Абон с исчерпанным лимитом, покрывающий дату (для подписей / Max).
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function pickDepletedMembershipInPeriod(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const candidates = (memberships ?? []).filter((m) => membershipIsSessionDepletedOn(m, d))
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/** “Действующий” абонемент на дату: внутри периода и есть остаток тренировок. Поле status не используем. */
export function membershipIsUsableOn(m, dateIso) {
  return membershipCoversDate(m, dateIso) && membershipHasRemaining(m)
}

export function pickUsableMembershipForDate(memberships, dateIso) {
  if (!dateIso || !memberships?.length) return null
  return memberships
    .filter((m) => membershipIsUsableOn(m, dateIso))
    .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0]
}

/** Есть ли абонемент, по которому можно провести тренировку в указанную дату (поле status в Row не используется). */
export function hasUsableMembershipOnDate(memberships, dateIso) {
  return pickUsableMembershipForDate(memberships, dateIso) != null
}

/**
 * Уже купленный абонемент со стартом позже даты (gap / «ждёт старт»).
 * Такого клиента не считаем «пропавшим» для неактивных и воронки возврата.
 */
export function hasUpcomingMembership(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return false
  return (memberships ?? []).some((m) => {
    const s = String(m?.start_date ?? '').slice(0, 10)
    const e = String(m?.end_date ?? '').slice(0, 10)
    if (!s || !e || s <= d) return false
    return membershipHasRemaining(m)
  })
}

/** Дней в периоде абонемента включительно (14→14 = 1; 14→15 = 2). */
export function membershipPeriodDayCount(m) {
  const s = String(m?.start_date ?? '').slice(0, 10)
  const e = String(m?.end_date ?? '').slice(0, 10)
  if (!s || !e || e < s) return null
  const ps = s.split('-').map(Number)
  const pe = e.split('-').map(Number)
  if (ps.length !== 3 || pe.length !== 3) return null
  const startD = new Date(ps[0], ps[1] - 1, ps[2])
  const endD = new Date(pe[0], pe[1] - 1, pe[2])
  return Math.round((endD - startD) / 86400000) + 1
}

/**
 * Самый ранний купленный абонемент со стартом позже даты и с остатком занятий.
 * @param {object[]} memberships
 * @param {string} dateIso
 */
export function pickEarliestUpcomingMembership(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return null
  const candidates = (memberships ?? []).filter((m) => {
    const s = String(m?.start_date ?? '').slice(0, 10)
    const e = String(m?.end_date ?? '').slice(0, 10)
    if (!s || !e || s <= d) return false
    return membershipHasRemaining(m)
  })
  if (!candidates.length) return null
  return candidates.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
}

/** Порог предупреждения «старт был далеко» (дней сдвига). */
export const EARLY_ACTIVATE_WARN_SHIFT_DAYS = 14

/** Макс. опоздание первой тренировки после start_date для предложения сдвига (дней). */
export const LATE_START_MAX_SHIFT_DAYS = 14

/**
 * Календарная разница isoA − isoB в днях (локальные даты YYYY-MM-DD).
 * @param {string} isoA
 * @param {string} isoB
 */
export function isoCalendarDaysDiff(isoA, isoB) {
  const a = String(isoA ?? '').slice(0, 10)
  const b = String(isoB ?? '').slice(0, 10)
  if (!a || !b) return null
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  if (pa.length !== 3 || pb.length !== 3) return null
  const da = new Date(pa[0], pa[1] - 1, pa[2])
  const db = new Date(pb[0], pb[1] - 1, pb[2])
  return Math.round((da - db) / 86400000)
}

/**
 * Пересекаются ли периоды [start,end] включительно.
 * @param {{ start_date?: string, end_date?: string } | null | undefined} a
 * @param {{ start_date?: string, end_date?: string } | null | undefined} b
 */
export function membershipPeriodsOverlap(a, b) {
  const as = String(a?.start_date ?? '').slice(0, 10)
  const ae = String(a?.end_date ?? '').slice(0, 10)
  const bs = String(b?.start_date ?? '').slice(0, 10)
  const be = String(b?.end_date ?? '').slice(0, 10)
  if (!as || !ae || !bs || !be || ae < as || be < bs) return false
  return as <= be && bs <= ae
}

/**
 * Предложение сдвинуть даты upcoming-абонемента на activateOnIso (длина периода та же).
 * Не вызывать, если на дату уже есть usable — иначе два overlapping.
 *
 * @param {object | null | undefined} membership
 * @param {string} activateOnIso
 * @returns {{
 *   ok: true,
 *   membershipId: string,
 *   from: { start: string, end: string },
 *   to: { start: string, end: string },
 *   daysShift: number,
 *   periodDays: number,
 *   warnFar: boolean,
 * } | { ok: false, error: string }}
 */
export function proposeEarlyMembershipActivation(membership, activateOnIso) {
  const activateOn = String(activateOnIso ?? '').slice(0, 10)
  if (!membership?.id) return { ok: false, error: 'no_membership' }
  if (!activateOn) return { ok: false, error: 'bad_date' }
  const fromStart = String(membership.start_date ?? '').slice(0, 10)
  const fromEnd = String(membership.end_date ?? '').slice(0, 10)
  if (!fromStart || !fromEnd || fromEnd < fromStart) return { ok: false, error: 'bad_period' }
  if (fromStart <= activateOn) return { ok: false, error: 'already_started' }
  if (!membershipHasRemaining(membership)) return { ok: false, error: 'depleted' }

  const periodDays = membershipPeriodDayCount(membership)
  if (!periodDays || periodDays < 1) return { ok: false, error: 'bad_period' }

  const toStart = activateOn
  const toEnd = addDaysToIso(toStart, periodDays - 1)
  const daysShift = isoCalendarDaysDiff(fromStart, activateOn)
  if (daysShift == null) return { ok: false, error: 'bad_date' }

  return {
    ok: true,
    membershipId: String(membership.id),
    from: { start: fromStart, end: fromEnd },
    to: { start: toStart, end: toEnd },
    daysShift,
    periodDays,
    warnFar: daysShift > EARLY_ACTIVATE_WARN_SHIFT_DAYS,
  }
}

/**
 * Можно ли предложить раннюю активацию на дату (нет usable, есть upcoming).
 * @param {object[]} memberships
 * @param {string} dateIso
 */
export function canOfferEarlyMembershipActivation(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return false
  if (pickUsableMembershipForDate(memberships, d)) return false
  return pickEarliestUpcomingMembership(memberships, d) != null
}

/**
 * Сдвиг срока уже стартовавшего абона на дату первой тренировки (длина та же).
 * Только если ещё не списывали занятия (поле + дневник) и опоздание ≤ LATE_START_MAX_SHIFT_DAYS.
 *
 * @param {object | null | undefined} membership
 * @param {string} activateOnIso
 * @param {{ otherMemberships?: object[], clientTrainings?: object[] }} [opts]
 * @returns {{
 *   ok: true,
 *   membershipId: string,
 *   from: { start: string, end: string },
 *   to: { start: string, end: string },
 *   daysShift: number,
 *   periodDays: number,
 *   warnFar: boolean,
 * } | { ok: false, error: string }}
 */
export function proposeLateMembershipStart(membership, activateOnIso, opts = {}) {
  const activateOn = String(activateOnIso ?? '').slice(0, 10)
  if (!membership?.id) return { ok: false, error: 'no_membership' }
  if (!activateOn) return { ok: false, error: 'bad_date' }
  const fromStart = String(membership.start_date ?? '').slice(0, 10)
  const fromEnd = String(membership.end_date ?? '').slice(0, 10)
  if (!fromStart || !fromEnd || fromEnd < fromStart) return { ok: false, error: 'bad_period' }
  if (fromStart >= activateOn) return { ok: false, error: 'already_aligned' }
  if (!membershipHasRemaining(membership)) return { ok: false, error: 'depleted' }
  if (!membershipCoversDate(membership, activateOn)) return { ok: false, error: 'not_covering' }

  const usedStored = Number(membership.used_trainings ?? 0)
  const usedDiary = countedUsedTrainingsOnMembership(membership, opts.clientTrainings ?? [])
  const used = Math.max(Number.isFinite(usedStored) ? usedStored : 0, usedDiary)
  if (used > 0) return { ok: false, error: 'already_used' }

  const daysShift = isoCalendarDaysDiff(activateOn, fromStart)
  if (daysShift == null || daysShift < 1) return { ok: false, error: 'bad_date' }
  if (daysShift > LATE_START_MAX_SHIFT_DAYS) return { ok: false, error: 'too_late' }

  const periodDays = membershipPeriodDayCount(membership)
  if (!periodDays || periodDays < 1) return { ok: false, error: 'bad_period' }

  const toStart = activateOn
  const toEnd = addDaysToIso(toStart, periodDays - 1)
  const nextPeriod = { start_date: toStart, end_date: toEnd }
  const selfId = String(membership.id)
  const others = opts.otherMemberships ?? []
  for (const other of others) {
    if (!other || String(other.id ?? '') === selfId) continue
    if (membershipPeriodsOverlap(nextPeriod, other)) {
      return { ok: false, error: 'overlap' }
    }
  }

  return {
    ok: true,
    membershipId: selfId,
    from: { start: fromStart, end: fromEnd },
    to: { start: toStart, end: toEnd },
    daysShift,
    periodDays,
    warnFar: false,
  }
}

/**
 * Разбор позднего старта для UI: offer / blocked (можно тренировать) / skip.
 * @param {object[]} memberships
 * @param {string} dateIso
 * @param {object[]} [clientTrainings]
 * @returns {{
 *   status: 'offer' | 'blocked' | 'skip',
 *   reason: string | null,
 *   proposal: object | null,
 *   membership: object | null,
 *   daysLate: number | null,
 *   message: string | null,
 * }}
 */
export function inspectLateMembershipStart(memberships, dateIso, clientTrainings = []) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return { status: 'skip', reason: 'bad_date', proposal: null, membership: null, daysLate: null, message: null }
  const usable = pickUsableMembershipForDate(memberships, d)
  if (!usable) {
    return { status: 'skip', reason: 'no_usable', proposal: null, membership: null, daysLate: null, message: null }
  }
  const fromStart = String(usable.start_date ?? '').slice(0, 10)
  const daysLate = fromStart ? isoCalendarDaysDiff(d, fromStart) : null
  const proposal = proposeLateMembershipStart(usable, d, {
    otherMemberships: memberships,
    clientTrainings,
  })
  if (proposal.ok) {
    return {
      status: 'offer',
      reason: null,
      proposal,
      membership: usable,
      daysLate: proposal.daysShift,
      message: null,
    }
  }
  if (proposal.error === 'overlap') {
    return {
      status: 'blocked',
      reason: 'overlap',
      proposal: null,
      membership: usable,
      daysLate,
      message:
        'Срок абонемента уже идёт, а сдвиг от первой тренировки нельзя: новые даты пересеклись бы со следующим абонементом. Можно провести тренировку без сдвига.',
    }
  }
  if (proposal.error === 'too_late') {
    return {
      status: 'blocked',
      reason: 'too_late',
      proposal: null,
      membership: usable,
      daysLate,
      message:
        'С даты старта прошло больше 14 дней — срок не сдвигаем. Можно провести тренировку с текущими датами абонемента.',
    }
  }
  return {
    status: 'skip',
    reason: proposal.error,
    proposal: null,
    membership: usable,
    daysLate,
    message: null,
  }
}

/**
 * Можно ли предложить сдвиг от первой тренировки (usable, used=0 по полю и дневнику, опоздание ≤14).
 * @param {object[]} memberships
 * @param {string} dateIso
 * @param {object[]} [clientTrainings]
 */
export function canOfferLateMembershipStart(memberships, dateIso, clientTrainings = []) {
  return inspectLateMembershipStart(memberships, dateIso, clientTrainings).status === 'offer'
}

/**
 * Можно ли открыть «Новую тренировку» (действующий абон или ранняя активация upcoming).
 * Кнопки списка/карточки не должны резать переход алертом — экран тренировки сам предложит сдвиг дат.
 * @param {object[]} memberships
 * @param {string} dateIso
 */
export function canStartNewTrainingForMemberships(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return false
  if (hasUsableMembershipOnDate(memberships, d)) return true
  return canOfferEarlyMembershipActivation(memberships, d)
}

/**
 * Отчётная дата для «активных / не активных» в сводке за период:
 * сегодня, если период текущий; иначе последний день периода.
 * @param {string} [asOf] yyyy-mm-dd (для тестов; по умолчанию — сегодня на устройстве)
 */
export function inactiveMembershipReferenceDate(dateFrom, dateTo, asOf = todayLocalIso()) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const today = String(asOf ?? '').slice(0, 10)
  if (!from || !to || from > to) return to || today
  if (today < from) return from
  if (today > to) return to
  return today
}

/**
 * Есть ли действующий абонемент в рамках сводки за период.
 * Учитывает абонементы, заканчивающиеся до последнего календарного дня месяца (напр. 29.06 при периоде до 30.06).
 */
export function hasUsableMembershipForPeriodStats(memberships, dateFrom, dateTo, asOf = todayLocalIso()) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const ref = inactiveMembershipReferenceDate(from, to, asOf)
  if (hasUsableMembershipOnDate(memberships, ref)) return true
  if (ref !== to) return false
  for (const m of memberships ?? []) {
    const s = String(m.start_date ?? '').slice(0, 10)
    const e = String(m.end_date ?? '').slice(0, 10)
    if (!s || !e || e < from || s > to) continue
    if (e >= ref) continue
    const lastDay = e
    if (lastDay >= from && membershipIsUsableOn(m, lastDay)) return true
  }
  return false
}

/** @returns {'depleted'|'empty_package'|'expired'|'not_started'|'no_membership'|null} */
export function inactiveMembershipReason(memberships, dateIso) {
  if (hasUsableMembershipOnDate(memberships, dateIso)) return null
  const list = memberships ?? []
  if (!list.length) return 'no_membership'
  const d = String(dateIso ?? '')
  // Куплен следующий (даже если текущий исчерпан по лимиту) — не «пропал», а ждёт старт.
  if (hasUpcomingMembership(list, d) || list.every((m) => String(m.start_date ?? '') > d)) {
    return 'not_started'
  }
  const covering = list.filter((m) => membershipCoversDate(m, d))
  // Пакет с лимитом занятий исчерпан (total > 0, used ≥ total).
  if (covering.some((m) => membershipIsSessionDepletedOn(m, d))) return 'depleted'
  // Срок кроет, но занятий в пакете нет (0/0 авто-заглушка и т.п.) — всё ещё «не активный», не «лимит исчерпан».
  if (covering.some((m) => isCalendarUnlimitedMembership(m))) return 'empty_package'
  return 'expired'
}

export const INACTIVE_MEMBERSHIP_REASON_LABELS = {
  depleted: 'тренировки закончились',
  empty_package: 'нет занятий в пакете',
  expired: 'срок абонемента прошёл',
  not_started: 'абонемент ещё не начался',
  no_membership: 'нет абонемента',
}

/**
 * Подпись для списка «Не активные»: причина + даты/остаток по релевантному абонементу.
 * @returns {{ reason: string, inactiveDetail: string, membershipEndDate?: string, membershipStartDate?: string }}
 */
export function inactiveMembershipDetail(memberships, dateIso) {
  const reason = inactiveMembershipReason(memberships, dateIso)
  if (reason == null) {
    return { reason: 'none', inactiveDetail: '' }
  }
  const list = memberships ?? []
  const d = String(dateIso ?? '').slice(0, 10)
  const withDates = list.filter((m) => m?.start_date && m?.end_date)

  if (reason === 'no_membership') {
    return { reason, inactiveDetail: INACTIVE_MEMBERSHIP_REASON_LABELS.no_membership }
  }

  if (reason === 'not_started') {
    const future = withDates
      .filter((m) => String(m.start_date) > d)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
    const startRu = future ? formatDateRu(future.start_date) : null
    return {
      reason,
      inactiveDetail: startRu ? `абонемент начнётся ${startRu}` : INACTIVE_MEMBERSHIP_REASON_LABELS.not_started,
      membershipStartDate: future?.start_date ?? null,
    }
  }

  if (reason === 'depleted') {
    const covering = withDates.filter((m) => membershipCoversDate(m, d))
    const depleted =
      covering
        .filter((m) => membershipIsSessionDepletedOn(m, d))
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0] ?? null
    if (depleted) {
      const used = Number(depleted.used_trainings ?? 0)
      const total = Number(depleted.total_trainings ?? 0)
      const endRu = formatDateRu(depleted.end_date)
      return {
        reason,
        inactiveDetail: `тренировки закончились (${used}/${total}), срок до ${endRu}`,
        membershipEndDate: depleted.end_date,
      }
    }
    return { reason, inactiveDetail: INACTIVE_MEMBERSHIP_REASON_LABELS.depleted }
  }

  if (reason === 'empty_package') {
    const covering = withDates.filter((m) => membershipCoversDate(m, d) && isCalendarUnlimitedMembership(m))
    const empty =
      covering.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0] ?? null
    if (empty) {
      const endRu = formatDateRu(empty.end_date)
      return {
        reason,
        inactiveDetail: endRu ? `нет занятий в пакете, срок до ${endRu}` : INACTIVE_MEMBERSHIP_REASON_LABELS.empty_package,
        membershipEndDate: empty.end_date,
      }
    }
    return { reason, inactiveDetail: INACTIVE_MEMBERSHIP_REASON_LABELS.empty_package }
  }

  const expired = withDates
    .filter((m) => String(m.end_date) < d)
    .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
  if (expired) {
    const endRu = formatDateRu(expired.end_date)
    const used = Number(expired.used_trainings ?? 0)
    const total = Number(expired.total_trainings ?? 0)
    const remain =
      Number.isFinite(total) && total > 0 && Number.isFinite(used) && used < total
        ? `, осталось ${total - used}/${total}`
        : ''
    return {
      reason,
      inactiveDetail: `срок абонемента закончился ${endRu}${remain}`,
      membershipEndDate: expired.end_date,
    }
  }

  return { reason, inactiveDetail: INACTIVE_MEMBERSHIP_REASON_LABELS.expired }
}

/** Подпись в списке (новые API-поля или fallback по reason). */
export function formatInactiveClientListLabel(client) {
  const detail = String(client?.inactiveDetail ?? '').trim()
  if (detail) return detail
  const reason = client?.inactiveReason
  return reason ? INACTIVE_MEMBERSHIP_REASON_LABELS[reason] ?? null : null
}

/** Пояснение, почему нет «действующего» абонемента на дату (для подписи в UI). */
export function explainInactiveMembership(memberships, dateIso) {
  const list = memberships ?? []
  if (!list.length) return 'Нет записей об абонементе — добавьте новый.'
  const d = String(dateIso ?? '')
  const withDates = list.filter((m) => m?.start_date && m?.end_date)
  if (!withDates.length) return 'У абонемента не заданы даты начала и окончания.'

  const future = withDates
    .filter((m) => String(m.start_date) > d)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]
  if (future) {
    return `Абонемент ещё не начался: старт ${formatDateRu(future.start_date)}. Укажите дату начала не позже сегодня (${formatDateRu(d)}).`
  }

  const inWindow = withDates.filter((m) => membershipCoversDate(m, d))
  const depleted = inWindow.find((m) => membershipIsSessionDepletedOn(m, d))
  if (depleted) {
    const used = Number(depleted.used_trainings ?? 0)
    const total = Number(depleted.total_trainings ?? 0)
    return `Срок действует, но лимит тренировок исчерпан (${used} из ${total}).`
  }
  if (inWindow.some((m) => isCalendarUnlimitedMembership(m))) {
    return 'Срок действует, но в пакете нет занятий (0). Часто это авто-заглушка — укажите число тренировок или оформите нормальный абонемент.'
  }

  const expired = withDates
    .filter((m) => String(m.end_date) < d)
    .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
  if (expired) {
    return `Срок абонемента истёк ${formatDateRu(expired.end_date)}. Продлите дату окончания.`
  }

  return 'Нет действующего абонемента (по датам и остатку тренировок).'
}

/** По дате, затем по created_at — для номера тренировки по абонементу */
export function compareTrainingsChronological(a, b) {
  const da = String(a?.date ?? '').slice(0, 10)
  const db = String(b?.date ?? '').slice(0, 10)
  if (da !== db) return da.localeCompare(db)
  return String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''))
}

/**
 * Завершённые тренировки, списанные на абонемент (как в MembershipManager).
 * @returns {object[]}
 */
export function completedTrainingsOnMembership(membership, allTrainings) {
  if (!membership?.id) return []
  const s = String(membership.start_date ?? '')
  const e = String(membership.end_date ?? '')
  const listSrc = Array.isArray(allTrainings) ? allTrainings : []

  const byId = listSrc.filter((t) => t?.status === 'completed' && t?.data?.membership_id === membership.id)
  const hasAnyById = byId.length > 0

  const legacyByRange = listSrc.filter((t) => {
    if (t?.status !== 'completed') return false
    const mid = t?.data?.membership_id
    if (mid) return false
    const d = String(t?.date ?? '').slice(0, 10)
    if (!d || !s || !e) return false
    return d >= s && d <= e
  })

  const list = hasAnyById
    ? [...byId, ...legacyByRange]
    : listSrc.filter((t) => {
        if (t?.status !== 'completed') return false
        const mid = t?.data?.membership_id
        if (mid && mid !== membership.id) return false
        const d = String(t?.date ?? '').slice(0, 10)
        if (!d || !s || !e) return false
        return d >= s && d <= e
      })

  const seen = new Set()
  const out = []
  for (const t of list) {
    if (!t?.id || seen.has(t.id)) continue
    seen.add(t.id)
    out.push(t)
  }

  out.sort(compareTrainingsChronological)
  return out
}

/** Сколько тренировок реально списано на абонемент (по дневнику), не только поле used_trainings. */
export function countedUsedTrainingsOnMembership(membership, clientTrainings) {
  return completedTrainingsOnMembership(membership, clientTrainings).length
}

/** Текст «used/total» для списка клиентов. */
export function membershipUsageLabel(membership, clientTrainings) {
  if (!membership) return '—'
  const usedDiary = countedUsedTrainingsOnMembership(membership, clientTrainings)
  const usedStored = Number(membership.used_trainings ?? 0)
  const used = Math.max(usedDiary, Number.isFinite(usedStored) ? usedStored : 0)
  const total = membership.total_trainings
  return `${used}/${total ?? '—'}`
}

/**
 * Номер завершённой тренировки по абонементу (1…total_trainings).
 * Если в данных тренировки есть membership_id — считаем только среди записей с тем же id.
 * Иначе — среди завершённых тренировок в датах [start_date…end_date] этого абонемента (хронология).
 */
export function completedWorkoutNumberOnMembership(training, membership, allTrainings) {
  if (!training?.id || !membership?.id || !Array.isArray(allTrainings)) return null
  const midStored = training.data?.membership_id
  let list = allTrainings.filter((x) => x?.status === 'completed')
  if (midStored) {
    if (midStored !== membership.id) return null
    // учитываем и legacy-записи без membership_id в пределах периода этого абонемента
    const s = String(membership.start_date ?? '')
    const e = String(membership.end_date ?? '')
    list = list.filter((x) => {
      const mid = x?.data?.membership_id
      if (mid) return mid === membership.id
      const d = String(x?.date ?? '').slice(0, 10)
      if (!d || !s || !e) return false
      return d >= s && d <= e
    })
  } else {
    const s = String(membership.start_date ?? '')
    const e = String(membership.end_date ?? '')
    list = list.filter((x) => {
      const d = String(x.date ?? '').slice(0, 10)
      if (!(d >= s && d <= e)) return false
      // legacy: не смешиваем с тренировками, уже привязанными к другому абонементу
      const mid = x?.data?.membership_id
      return !mid || mid === membership.id
    })
  }
  list.sort(compareTrainingsChronological)
  const idx = list.findIndex((x) => x.id === training.id)
  return idx >= 0 ? idx + 1 : null
}

/** Абонемент строки карточки: явный из data.membership_id или действующий на дату расписания. */
export function resolveMembershipForDiaryTraining(training, dateStr, memberships) {
  if (!dateStr || !memberships?.length) return null
  const mid = training?.data?.membership_id
  if (mid) {
    const m = memberships.find((x) => x.id === mid)
    if (m) return m
  }
  return pickUsableMembershipForDate(memberships, dateStr)
}
