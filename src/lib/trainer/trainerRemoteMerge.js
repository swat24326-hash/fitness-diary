/**
 * Слияние локального кэша и облака для журнала/ЗП тренера (чистые функции).
 */

/**
 * Облако побеждает в диапазоне; локальные вне диапазона и без id в remote — оставляем.
 * @param {object[]} localTrainings
 * @param {object[]} remote
 * @param {string} fetchFrom
 * @param {string} dateTo
 */
export function mergeLocalAndRemoteTrainings(localTrainings, remote, fetchFrom, dateTo) {
  const from = String(fetchFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const remoteIds = new Set((remote ?? []).map((t) => String(t.id)))
  const keepLocal = (localTrainings ?? []).filter((t) => {
    const id = String(t?.id ?? '')
    if (id && remoteIds.has(id)) return false
    const d = String(t?.date ?? '').slice(0, 10)
    return !d || d < from || d > to
  })
  return [...keepLocal, ...(remote ?? [])]
}

/** @param {object[]} local @param {object[]} remote */
export function mergeRowsById(local, remote) {
  const map = new Map()
  for (const row of local ?? []) {
    const id = String(row?.id ?? '').trim()
    if (id) map.set(id, row)
  }
  for (const row of remote ?? []) {
    const id = String(row?.id ?? '').trim()
    if (id) map.set(id, row)
  }
  return [...map.values()]
}
