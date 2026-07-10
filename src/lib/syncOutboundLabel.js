/**
 * Подписи очереди sync для шапки и баннеров (без React).
 */

/**
 * @param {{ queue?: number, localOnly?: number, total?: number }} s
 * @returns {string}
 */
export function formatSyncOutboundShort(s) {
  const queue = Number(s?.queue) || 0
  const localOnly = Number(s?.localOnly) || 0
  const total = Number.isFinite(s?.total) ? Number(s.total) : queue + localOnly
  if (total <= 0) return ''
  const verb = total === 1 ? 'ждёт' : 'ждут'
  return `${total} ${verb}`
}

/**
 * @param {{ queue?: number, localOnly?: number, total?: number }} s
 * @returns {string}
 */
export function formatSyncOutboundBannerMessage(s) {
  const queue = Number(s?.queue) || 0
  const localOnly = Number(s?.localOnly) || 0
  const total = Number.isFinite(s?.total) ? Number(s.total) : queue + localOnly
  if (total <= 0) return ''

  const rec =
    total === 1 ? 'запись' : total >= 2 && total <= 4 ? 'записи' : 'записей'

  if (localOnly > 0 && queue === 0) {
    return `${localOnly} ${localOnly === 1 ? 'запись' : localOnly < 5 ? 'записи' : 'записей'} только на устройстве — не ушли в облако.`
  }
  if (localOnly > 0 && queue > 0) {
    return `${total} ${rec} ждут отправки (${queue} в очереди, ${localOnly} только на устройстве).`
  }
  return `${total} ${rec} ${total === 1 ? 'ждёт' : 'ждут'} отправки в облако.`
}

/**
 * @param {{
 *   queue?: number,
 *   localOnly?: number,
 *   busy?: boolean,
 *   percent?: number,
 *   progressLabel?: string,
 * }} s
 * @returns {string}
 */
export function formatSyncOutboundTitle(s) {
  const queue = Number(s?.queue) || 0
  const localOnly = Number(s?.localOnly) || 0
  const total = queue + localOnly

  if (s?.busy) {
    const pct = Math.round(Number(s?.percent) || 0)
    const label = String(s?.progressLabel ?? '').trim()
    return label ? `${pct}% — ${label}` : `Синхронизация… ${pct}%`
  }

  if (total <= 0) return 'Синхронизировать с облаком'

  if (localOnly > 0 && queue === 0) {
    return `Только на устройстве: ${localOnly} — отправить в облако`
  }
  if (localOnly > 0) {
    return `Очередь ${queue}, ещё ${localOnly} только на устройстве`
  }
  return `Отправить в облако (${queue} в очереди)`
}

/**
 * @param {{ queue?: number, localOnly?: number, total?: number }} s
 * @returns {string}
 */
export function formatSyncOutboundMenuLabel(s) {
  const total = Number.isFinite(s?.total) ? Number(s.total) : (Number(s?.queue) || 0) + (Number(s?.localOnly) || 0)
  if (total <= 0) return 'Синхронизировать'
  return `Синхронизировать (${total})`
}
