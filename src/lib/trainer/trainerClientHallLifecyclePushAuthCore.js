/**
 * Какие записи client_hall_lifecycle тренер может пушить.
 * UI закрывает только ПЗ; при close ПЗ в очередь ещё уходят авто-закрытия ТЗ/АЗ
 * («Закончился абонемент») — их сервер тоже должен принять.
 */

import { AUTO_CLOSE_HALL_REASON } from '../clientHallLifecycleCore.js'
import { normalizeMembershipHall } from '../membershipHallCore.js'

/**
 * @param {{
 *   operation?: string,
 *   hall?: unknown,
 *   close_reason?: unknown,
 *   closed_at?: unknown,
 * }} p
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertTrainerClientHallLifecyclePush(p = {}) {
  const op = String(p.operation ?? '').trim()
  const rawHall = p.hall
  const hallRaw = rawHall == null ? '' : String(rawHall).trim()
  const hall = hallRaw ? normalizeMembershipHall(hallRaw) : null

  if (op === 'delete') {
    if (hallRaw && !hall) return { ok: false, error: 'Неизвестный зал' }
    if (hall && hall !== 'pz') {
      return { ok: false, error: 'Тренер может менять только направление ПЗ' }
    }
    return { ok: true }
  }

  if (op !== 'insert' && op !== 'update') return { ok: true }

  if (hallRaw && !hall) return { ok: false, error: 'Неизвестный зал' }
  if (!hall || hall === 'pz') return { ok: true }

  const reason = String(p.close_reason ?? '').trim()
  if (reason === AUTO_CLOSE_HALL_REASON) return { ok: true }

  // Открытие зала после абона: в payload явно closed_at: null.
  if (
    Object.prototype.hasOwnProperty.call(p, 'closed_at') &&
    (p.closed_at == null || String(p.closed_at).trim() === '')
  ) {
    return { ok: true }
  }

  return { ok: false, error: 'Тренер может закрывать только направление ПЗ' }
}
