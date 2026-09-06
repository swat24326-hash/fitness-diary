import { resolveScheduleMonthWindow } from './trainerScheduleAdminCore.js'
import { fetchClubTrainerScheduleViaApi } from './adminApiClient.js'

/**
 * @param {{ clubId: string, trainerId?: string, dayFrom: string, dayTo: string }}
 */
export async function loadClubTrainerScheduleRange({ clubId, trainerId = '', dayFrom, dayTo }) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return { ok: false, error: 'Выберите клуб' }
  }
  const from = String(dayFrom ?? '').slice(0, 10)
  const to = String(dayTo ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { ok: false, error: 'Некорректный период' }
  }
  const data = await fetchClubTrainerScheduleViaApi({
    clubId: cid,
    trainerId: String(trainerId ?? '').trim(),
    dayFrom: from,
    dayTo: to,
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
    dayFrom: from,
    dayTo: to,
  }
}

/**
 * @param {{ clubId: string, trainerId?: string, year: number, month: number }}
 */
export async function loadClubTrainerScheduleMonth({ clubId, trainerId = '', year, month }) {
  const window = resolveScheduleMonthWindow(year, month)
  if (!window) {
    return { ok: false, error: 'Некорректный месяц' }
  }
  return loadClubTrainerScheduleRange({
    clubId,
    trainerId,
    dayFrom: window.dayFrom,
    dayTo: window.dayTo,
  })
}
