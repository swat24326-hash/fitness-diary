import { formatDateRu } from './dateRu'

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
