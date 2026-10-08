/**
 * /me/trainings: тренировки клиента за 30 дней — то же окно, что цифра «за 30 дней» в прогрессе.
 * Неявки в списке с пометкой: они списывают абонемент, клиент должен видеть, куда ушло занятие.
 * Наружу дата, направленность, вес, имя тренера и id тренировки (для окна просмотра — clientTrainingHandler
 * отдаёт её только этому клиенту). Упражнения и комментарии — в окне, не в списке.
 */
import { parseWeightKg } from '../../../src/lib/clientWeightCore.js'
import { isLoyaltyNoShowTraining } from '../../../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import { isoCalendarDaysDiff } from '../../../src/lib/membershipRules.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MAX_RECENT = 40
const FOCUS_MAX = 60
export const RECENT_DAYS = 30

const day = (v) => String(v ?? '').slice(0, 10)
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, FOCUS_MAX)

function parseData(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw ?? ''))
  } catch {
    return {}
  }
}

/** @returns {string[]} тренеры этих тренировок — чтобы подгрузить имена одним запросом */
export function recentTrainerIds(trainings, today) {
  return [...new Set(pickRecent(trainings, today).map(({ t }) => String(t.trainer_id ?? '')).filter(Boolean))]
}

function pickRecent(trainings, today) {
  return (trainings ?? [])
    .filter((t) => t?.status === 'completed')
    .map((t) => ({ t, date: day(t.date) }))
    .filter(({ date }) => ISO.test(date) && date <= today && (isoCalendarDaysDiff(today, date) ?? 99) < RECENT_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_RECENT)
}

/**
 * @param {object[]} trainings завершённые тренировки клиента
 * @param {Map<string, string>} trainerNameById
 */
export function buildClientRecentTrainings(trainings, today, trainerNameById) {
  return pickRecent(trainings, today).map(({ t, date }) => {
    const data = parseData(t.data)
    const noShow = isLoyaltyNoShowTraining({ ...t, data })
    return {
      id: String(t.id ?? ''),
      date,
      focus: noShow ? null : clean(data.training_focus) || clean(t.type) || null,
      kg: noShow ? null : parseWeightKg(data.pre_weight_kg),
      trainer_name: trainerNameById?.get(String(t.trainer_id ?? '')) || null,
      no_show: noShow,
    }
  })
}
