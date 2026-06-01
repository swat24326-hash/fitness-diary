import { formatDateRu, todayLocalIso } from './dateRu.js'

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
  const covering = list.filter((m) => membershipCoversDate(m, d))
  if (covering.some((m) => !membershipHasRemaining(m))) return 'depleted'
  if (list.every((m) => String(m.start_date ?? '') > d)) return 'not_started'
  return 'expired'
}

export const INACTIVE_MEMBERSHIP_REASON_LABELS = {
  depleted: 'тренировки закончились',
  expired: 'срок абонемента прошёл',
  not_started: 'абонемент ещё не начался',
  no_membership: 'нет абонемента',
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
  const used = countedUsedTrainingsOnMembership(membership, clientTrainings)
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
