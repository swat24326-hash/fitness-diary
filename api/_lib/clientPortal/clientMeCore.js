/**
 * Ответ /api/client-me: только белые списки полей. Заметки тренера, data тренировок,
 * оплаты, телефоны и id сотрудников клиенту не уходят.
 */
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../../../src/lib/bodyMeasures.js'
import { listTrainingPreWeights } from '../../../src/lib/clientWeightCore.js'
import { isLoyaltyNoShowTraining } from '../../../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import {
  countedUsedTrainingsOnMembership,
  isCalendarUnlimitedMembership,
  isoCalendarDaysDiff,
} from '../../../src/lib/membershipRules.js'
import { formatScheduleTimeRange } from '../../../src/lib/trainer/trainerScheduleCore.js'
import { buildMembershipVisits } from './clientMembershipVisitsCore.js'
import { weeksStreak } from './clientWeeksStreakCore.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (v) => String(v ?? '').slice(0, 10)
const MAX_MEMBERSHIPS = 4
const MAX_WEIGHTS = 24
const MAX_MEASUREMENTS = 6

function membershipStatus(m, used, today) {
  if (day(m.start_date) > today) return 'upcoming'
  if (!isCalendarUnlimitedMembership(m) && used >= Number(m.total_trainings)) return 'depleted'
  return 'active'
}

const validMemberships = (memberships) =>
  (memberships ?? []).filter((m) => ISO.test(day(m.start_date)) && ISO.test(day(m.end_date)))

/** Абонементы, которые видит клиент: ещё не закончившиеся по сроку, а если таких нет — последний закончившийся. */
export function visibleClientMemberships(memberships, today) {
  const valid = validMemberships(memberships)
  const current = valid
    .filter((m) => day(m.end_date) >= today)
    .sort((a, b) => day(a.start_date).localeCompare(day(b.start_date)))
    .slice(0, MAX_MEMBERSHIPS)
  if (current.length) return { current, last_ended: null }
  const last = [...valid].sort((a, b) => day(b.end_date).localeCompare(day(a.end_date)))[0]
  return { current: [], last_ended: last ?? null }
}

/**
 * Счётчик как в списке тренера: max(дневник, поле used_trainings); visits — тренировки этих списаний
 * (у закончившегося тоже — клиент без действующего абонемента видит прошлые тренировки).
 * @param {Map<string, string>} [trainerNameById]
 */
export function buildClientMemberships(memberships, types, trainings, today, trainerNameById) {
  const codeById = new Map((types ?? []).map((t) => [String(t.id), String(t.code ?? '').trim()]))
  const view = (m) => {
    const unlimited = isCalendarUnlimitedMembership(m)
    const stored = Number(m.used_trainings ?? 0)
    const used = Math.max(countedUsedTrainingsOnMembership(m, trainings), Number.isFinite(stored) ? stored : 0)
    const total = unlimited ? null : Number(m.total_trainings)
    return {
      label: codeById.get(String(m.membership_type_id ?? '')) || 'Абонемент',
      start_date: day(m.start_date),
      end_date: day(m.end_date),
      total,
      used,
      remaining: total == null ? null : Math.max(0, total - used),
      days_left: Math.max(0, isoCalendarDaysDiff(day(m.end_date), today) ?? 0),
      status: membershipStatus(m, used, today),
      visits: buildMembershipVisits(m, trainings, trainerNameById),
    }
  }
  const { current, last_ended } = visibleClientMemberships(memberships, today)
  return { current: current.map(view), last_ended: last_ended ? { ...view(last_ended), status: 'ended' } : null }
}

/**
 * Ближайший слот ежедневника, где есть клиент. Сегодняшние уже закончившиеся пропускаем.
 * @param {object[]} entries строки trainer_schedule_entries
 * @param {Map<string, string>} trainerNameById
 */
export function pickNextClientSession(entries, today, nowMinutes, trainerNameById) {
  const next = (entries ?? [])
    .filter((e) => {
      const d = day(e.day_date)
      if (!ISO.test(d) || d < today) return false
      if (d > today) return true
      return Number(e.start_minutes) + Number(e.duration_minutes ?? 60) > nowMinutes
    })
    .sort((a, b) => day(a.day_date).localeCompare(day(b.day_date)) || Number(a.start_minutes) - Number(b.start_minutes))[0]
  if (!next) return null
  return {
    date: day(next.day_date),
    time: formatScheduleTimeRange(next),
    trainer_name: trainerNameById?.get(String(next.trainer_id)) || null,
  }
}

function measurementView(row) {
  const values = {}
  for (const f of BODY_MEASURE_FIELDS) {
    const n = Number(getMeasureValue(row, f.id))
    if (Number.isFinite(n) && n > 0) values[f.id] = n
  }
  return Object.keys(values).length ? { date: day(row.date), values } : null
}

/**
 * Вес — из завершённых тренировок и ручных записей: в client_weight_entries вес тренировки
 * попадает только после открытия истории веса в карточке. Один день — одно значение, тренировка главнее.
 * @param {object[]} trainings завершённые тренировки клиента
 * @param {object[]} weights client_weight_entries
 * @param {object[]} measurements body_measurements
 */
export function buildClientProgress(trainings, weights, measurements, today) {
  const visits = (trainings ?? []).filter((t) => t?.status === 'completed' && !isLoyaltyNoShowTraining(t))
  const dates = visits.map((t) => day(t.date)).filter((d) => ISO.test(d) && d <= today).sort()
  const monthAgo = dates.filter((d) => (isoCalendarDaysDiff(today, d) ?? 99) < 30)
  const weightByDay = new Map()
  for (const w of weights ?? []) {
    const kg = Number(w.weight_kg)
    if (ISO.test(day(w.date)) && Number.isFinite(kg) && kg > 0) weightByDay.set(day(w.date), kg)
  }
  for (const t of listTrainingPreWeights(trainings)) {
    if (t.date <= today) weightByDay.set(t.date, t.weightKg)
  }
  const weightRows = [...weightByDay]
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const measureRows = (measurements ?? [])
    .filter((m) => ISO.test(day(m.date)))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
    .map(measurementView)
    .filter(Boolean)
  return {
    visits_total: dates.length,
    visits_30d: monthAgo.length,
    first_visit: dates[0] ?? null,
    last_visit: dates.at(-1) ?? null,
    weeks_streak: weeksStreak(dates, today),
    weights: weightRows.slice(-MAX_WEIGHTS),
    measurements: measureRows.slice(-MAX_MEASUREMENTS),
  }
}

/** Бонусы: только итог снимка. Программа выключена и баллов нет — блок не показываем. */
export function buildClientLoyalty(snapshot) {
  if (!snapshot) return null
  const points = Number(snapshot.points) || 0
  if (snapshot.enabled !== true && points <= 0) return null
  return {
    enabled: snapshot.enabled === true,
    points,
    unlock_on: snapshot.unlock_on ?? null,
    can_redeem: snapshot.can_redeem === true,
  }
}

export const CLIENT_ME_KEYS = ['client', 'club', 'memberships', 'next_session', 'progress', 'loyalty', 'as_of']
