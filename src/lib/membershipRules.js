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
  for (const m of memberships ?? []) {
    const total = Number(m?.total_trainings ?? 0)
    if (!(Number.isFinite(total) && total > 0)) continue
    if (!membershipCoversDate(m, d)) continue
    if (!membershipHasRemaining(m)) return true
  }
  return false
}

/**
 * Абон с исчерпанным лимитом, покрывающий дату (для подписей / Max).
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function pickDepletedMembershipInPeriod(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const candidates = (memberships ?? []).filter((m) => {
    const total = Number(m?.total_trainings ?? 0)
    if (!(Number.isFinite(total) && total > 0)) return false
    if (!membershipCoversDate(m, d)) return false
    return !membershipHasRemaining(m)
  })
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
  const daysShift = (() => {
    const ps = fromStart.split('-').map(Number)
    const pa = activateOn.split('-').map(Number)
    const a = new Date(ps[0], ps[1] - 1, ps[2])
    const b = new Date(pa[0], pa[1] - 1, pa[2])
    return Math.round((a - b) / 86400000)
  })()

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

/** @returns {'depleted'|'expired'|'not_started'|'no_membership'} */
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
  if (covering.some((m) => !membershipHasRemaining(m))) return 'depleted'
  return 'expired'
}

export const INACTIVE_MEMBERSHIP_REASON_LABELS = {
  depleted: 'тренировки закончились',
  expired: 'срок абонемента прошёл',
  not_started: 'абонемент ещё не начался',
  no_membership: 'нет абонемента',
}

/**
 * Подпись для списка «Не активные»: причина + даты/остаток по релевантному абонементу.
 * @returns {{ reason: string, inactiveDetail: string, membershipEndDate?: string, membershipStartDate?: string }}
 */
export function inactiveMembershipDetail(memberships, dateIso) {
  const reason = inactiveMembershipReason(memberships, dateIso) ?? 'expired'
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
        .filter((m) => !membershipHasRemaining(m))
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0] ??
      withDates
        .filter((m) => !membershipHasRemaining(m))
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0]
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
  const depleted = inWindow.find((m) => !membershipHasRemaining(m))
  if (depleted) {
    return 'Срок действует, но лимит тренировок исчерпан (0 из пакета).'
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
