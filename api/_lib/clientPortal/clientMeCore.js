/**
 * Ответ /api/client-me: только белые списки полей. Заметки тренера, data тренировок,
 * оплаты, телефоны и id сотрудников клиенту не уходят.
 */
import { BODY_MEASURE_FIELDS, getMeasureValue } from '../../../src/lib/bodyMeasures.js'
import { listTrainingPreWeights } from '../../../src/lib/clientWeightCore.js'
import {
  countedUsedTrainingsOnMembership,
  isCalendarUnlimitedMembership,
  isoCalendarDaysDiff,
} from '../../../src/lib/membershipRules.js'
import { pickClientNextSession } from '../../../src/lib/client/clientAzNextSessionCore.js'
import { membershipHallMarkRu } from '../../../src/lib/client/clientHomeHallCore.js'
import {
  CLUB_WEIGHT_ENTRY_SOURCES,
  PROGRESS_CLUB_SOURCE,
  PROGRESS_SELF_SOURCE,
  measureRowProgressSource,
  weightEntryProgressSource,
} from '../../../src/lib/client/clientProgressSelfCore.js'
import { collectClientVisitDates } from '../../../src/lib/client/clientVisitDatesCore.js'
import { normalizeSessionVisits } from '../../../src/lib/admin/deskAzSessionDeductCore.js'
import { normalizeMembershipHall } from '../../../src/lib/membershipHallCore.js'
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
  const typeById = new Map((types ?? []).map((t) => [String(t.id), t]))
  const view = (m) => {
    const unlimited = isCalendarUnlimitedMembership(m)
    const stored = Number(m.used_trainings ?? 0)
    const hall = normalizeMembershipHall(m.hall) ?? 'pz'
    const deskUsed = hall === 'az' ? normalizeSessionVisits(m.session_visits).length : 0
    /* АЗ: правда = session_visits / used_trainings, не дневник ПЗ без membership_id. */
    const diaryUsed = hall === 'az' ? 0 : countedUsedTrainingsOnMembership(m, trainings)
    const used = Math.max(diaryUsed, Number.isFinite(stored) ? stored : 0, deskUsed)
    const total = unlimited ? null : Number(m.total_trainings)
    const type = typeById.get(String(m.membership_type_id ?? ''))
    const code = String(type?.code ?? '').trim()
    const typeName = String(type?.name ?? '').trim()
    const label = code || typeName || 'Абонемент'
    const directionLabel = hall === 'az' ? typeName || code : ''
    return {
      label,
      hall,
      hall_mark: membershipHallMarkRu(hall, hall === 'az' ? typeName || code : label),
      start_date: day(m.start_date),
      end_date: day(m.end_date),
      total,
      used,
      remaining: total == null ? null : Math.max(0, total - used),
      days_left: Math.max(0, isoCalendarDaysDiff(day(m.end_date), today) ?? 0),
      status: membershipStatus(m, used, today),
      visits: buildMembershipVisits(m, trainings, trainerNameById, { hall, directionLabel }),
    }
  }
  const { current, last_ended } = visibleClientMemberships(memberships, today)
  return { current: current.map(view), last_ended: last_ended ? { ...view(last_ended), status: 'ended' } : null }
}

/**
 * Ближайший слот: персоналка (клиент в client_ids) и/или группы АЗ — см. pickClientNextSession.
 * @param {object[]} entries строки trainer_schedule_entries (обычно персоналки)
 * @param {Map<string, string>} trainerNameById
 * @param {{ groupEntries?: object[], azLinks?: object[], directionNameById?: Map<string, string> }} [opts]
 */
export function pickNextClientSession(entries, today, nowMinutes, trainerNameById, opts = {}) {
  return pickClientNextSession({
    personalEntries: entries,
    groupEntries: opts.groupEntries,
    azLinks: opts.azLinks,
    today,
    nowMinutes,
    trainerNameById,
    directionNameById: opts.directionNameById,
  })
}

function measurementView(row) {
  const values = {}
  for (const f of BODY_MEASURE_FIELDS) {
    const n = Number(getMeasureValue(row, f.id))
    if (Number.isFinite(n) && n > 0) values[f.id] = n
  }
  if (!Object.keys(values).length) return null
  const source = measureRowProgressSource(row)
  const id = source === PROGRESS_SELF_SOURCE && row?.id != null ? String(row.id) : undefined
  return {
    date: day(row.date),
    values,
    source,
    ...(id ? { id } : {}),
    editable: source === PROGRESS_SELF_SOURCE && Boolean(id),
  }
}

/**
 * Вес — из завершённых тренировок и записей client_weight_entries.
 * Один день — одно значение: клуб (тренировка / manual / baseline) главнее клиентской ○.
 * Факт «всего / 30 дней / серия» — уникальные даты персоналок + session_visits АЗ.
 * @param {object[]} trainings завершённые тренировки клиента
 * @param {object[]} weights client_weight_entries
 * @param {object[]} measurements body_measurements
 * @param {string} today
 * @param {object[]} [memberships] сырые абоны (для дат АЗ)
 */
export function buildClientProgress(trainings, weights, measurements, today, memberships) {
  const dates = collectClientVisitDates(trainings, memberships, today)
  const monthAgo = dates.filter((d) => (isoCalendarDaysDiff(today, d) ?? 99) < 30)
  /** @type {Map<string, { date: string, kg: number, source: string, id?: string }>} */
  const weightByDay = new Map()
  for (const w of weights ?? []) {
    if (weightEntryProgressSource(w) !== PROGRESS_SELF_SOURCE) continue
    const kg = Number(w.weight_kg)
    const d = day(w.date)
    if (!ISO.test(d) || !Number.isFinite(kg) || kg <= 0) continue
    const id = w.id != null ? String(w.id) : undefined
    weightByDay.set(d, { date: d, kg, source: PROGRESS_SELF_SOURCE, ...(id ? { id } : {}) })
  }
  for (const w of weights ?? []) {
    const src = String(w?.source ?? '')
    if (src === PROGRESS_SELF_SOURCE) continue
    if (src && !CLUB_WEIGHT_ENTRY_SOURCES.has(src)) continue
    const kg = Number(w.weight_kg)
    const d = day(w.date)
    if (!ISO.test(d) || !Number.isFinite(kg) || kg <= 0) continue
    weightByDay.set(d, { date: d, kg, source: PROGRESS_CLUB_SOURCE })
  }
  for (const t of listTrainingPreWeights(trainings)) {
    if (t.date > today) continue
    weightByDay.set(t.date, { date: t.date, kg: t.weightKg, source: PROGRESS_CLUB_SOURCE })
  }
  const weightRows = [...weightByDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  /** @type {Map<string, object>} */
  const measureByDay = new Map()
  const measureSorted = [...(measurements ?? [])]
    .filter((m) => ISO.test(day(m.date)))
    .sort((a, b) => day(a.date).localeCompare(day(b.date)))
  for (const m of measureSorted) {
    const view = measurementView(m)
    if (!view) continue
    const prev = measureByDay.get(view.date)
    if (!prev || view.source === PROGRESS_CLUB_SOURCE) measureByDay.set(view.date, view)
  }
  const measureRows = [...measureByDay.values()]
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
