/**
 * Id воскресного авто-ДЗ. Отдельный файл, чтобы лента тренера не тянула генератор недели.
 */
import { calendarDayInTimeZoneIso } from '../../dateRu.js'
import { stableUuid } from '../../stableUuid.js'

export const homeworkAutoPlanId = (clientId, sundayIso) =>
  stableUuid(`homework_auto_plan:${String(clientId ?? '')}:${String(sundayIso ?? '')}`)

/** Строка client_plans — воскресное авто-задание, не кнопка «В приложение». */
export function isHomeworkAutoPlanRow(row) {
  const id = String(row?.id ?? '')
  const cid = String(row?.client_id ?? '')
  const sent = String(row?.sent_at ?? '')
  if (row?.kind !== 'homework' || !id || !cid || !sent) return false
  const day = calendarDayInTimeZoneIso(sent)
  if (!day) return false
  return homeworkAutoPlanId(cid, day) === id
}
