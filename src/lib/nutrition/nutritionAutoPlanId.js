/**
 * Id воскресной авто-отправки рациона. Отдельный файл, чтобы лента тренера
 * не тянула сборку меню.
 */
import { calendarDayInTimeZoneIso } from '../dateRu.js'
import { stableUuid } from '../stableUuid.js'

export const nutritionAutoPlanId = (clientId, sundayIso) =>
  stableUuid(`nutrition_auto_plan:${String(clientId ?? '')}:${String(sundayIso ?? '')}`)

/** Строка client_plans — воскресный авто-рацион, не кнопка «В приложение». */
export function isNutritionAutoPlanRow(row) {
  const id = String(row?.id ?? '')
  const cid = String(row?.client_id ?? '')
  const sent = String(row?.sent_at ?? '')
  if (row?.kind !== 'nutrition' || !id || !cid || !sent) return false
  const day = calendarDayInTimeZoneIso(sent)
  if (!day) return false
  return nutritionAutoPlanId(cid, day) === id
}
