/** Last-good кэш ЗП/сводки тренера (localStorage) — не показывать нули при обрыве сети. */

const PREFIX = 'fd-tr-self-stats:v1:'

function key(trainerId, dateFrom, dateTo, dayIso) {
  return `${PREFIX}${trainerId}:${dateFrom}:${dateTo}:${dayIso}`
}

/**
 * @returns {{ payroll: { dayPay: number, monthPay: number }, period?: object, savedAt: number } | null}
 */
export function readTrainerSelfStatsLastGood(trainerId, dateFrom, dateTo, dayIso) {
  try {
    const raw = localStorage.getItem(key(trainerId, dateFrom, dateTo, dayIso))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.payroll || typeof parsed.payroll.dayPay !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function writeTrainerSelfStatsLastGood(trainerId, dateFrom, dateTo, dayIso, payload) {
  try {
    localStorage.setItem(
      key(trainerId, dateFrom, dateTo, dayIso),
      JSON.stringify({
        payroll: payload.payroll,
        period: payload.period ?? null,
        savedAt: Date.now(),
        source: payload.source ?? 'api',
      }),
    )
  } catch {
    /* quota */
  }
}
