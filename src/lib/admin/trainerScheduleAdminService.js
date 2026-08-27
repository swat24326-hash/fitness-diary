import { resolveScheduleMonthWindow } from './trainerScheduleAdminCore.js'
import { fetchClubTrainerScheduleViaApi } from './adminApiClient.js'

/**
 * @param {{ clubId: string, trainerId?: string, year: number, month: number }}
 */
export async function loadClubTrainerScheduleMonth({ clubId, trainerId = '', year, month }) {
  const window = resolveScheduleMonthWindow(year, month)
  if (!window) {
    return { ok: false, error: 'Некорректный месяц' }
  }
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return { ok: false, error: 'Выберите клуб' }
  }
  const data = await fetchClubTrainerScheduleViaApi({
    clubId: cid,
    trainerId: String(trainerId ?? '').trim(),
    dayFrom: window.dayFrom,
    dayTo: window.dayTo,
  })
  if (!data) {
    return { ok: false, error: 'API расписания недоступен — обновите страницу после деплоя' }
  }
  if (data.error) {
    return { ok: false, error: String(data.error) }
  }
  return {
    ok: true,
    entries: Array.isArray(data.entries) ? data.entries : [],
    clientNameById: data.clientNameById ?? {},
    trainerNameById: data.trainerNameById ?? {},
    trainingById: data.trainingById ?? {},
    truncated: Boolean(data.truncated),
    dayFrom: window.dayFrom,
    dayTo: window.dayTo,
  }
}
