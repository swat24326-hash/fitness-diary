/**
 * /me/trainings: тренировки по абонементу — те же, что дают счётчик «N из M» (completedTrainingsOnMembership).
 * Неявки в списке с пометкой: они списывают абонемент, клиент должен видеть, куда ушло занятие.
 * Наружу дата, направленность, вес, имя тренера и id (для окна просмотра — clientTrainingHandler
 * отдаёт тренировку только этому клиенту). Упражнения и комментарии — в окне, не в списке.
 */
import { parseWeightKg } from '../../../src/lib/clientWeightCore.js'
import { isLoyaltyNoShowTraining } from '../../../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import { completedTrainingsOnMembership } from '../../../src/lib/membershipRules.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MAX_VISITS = 200
const FOCUS_MAX = 60
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

/**
 * @param {Map<string, string>} [trainerNameById]
 * @returns {{ id: string, date: string, focus: string|null, kg: number|null, trainer_name: string|null, no_show: boolean }[]}
 *   по возрастанию даты — номер строки = порядок списания
 */
export function buildMembershipVisits(membership, trainings, trainerNameById) {
  return completedTrainingsOnMembership(membership, trainings)
    .filter((t) => ISO.test(day(t.date)))
    .slice(-MAX_VISITS)
    .map((t) => {
      const data = parseData(t.data)
      const noShow = isLoyaltyNoShowTraining({ ...t, data })
      return {
        id: String(t.id ?? ''),
        date: day(t.date),
        focus: noShow ? null : clean(data.training_focus) || clean(t.type) || null,
        kg: noShow ? null : parseWeightKg(data.pre_weight_kg),
        trainer_name: trainerNameById?.get(String(t.trainer_id ?? '')) || null,
        no_show: noShow,
      }
    })
}

/** @returns {string[]} тренеры тренировок по этим абонементам — подгрузить имена одним запросом */
export function membershipVisitTrainerIds(memberships, trainings) {
  const ids = (memberships ?? []).flatMap((m) =>
    completedTrainingsOnMembership(m, trainings).map((t) => String(t.trainer_id ?? '')),
  )
  return [...new Set(ids.filter(Boolean))]
}
