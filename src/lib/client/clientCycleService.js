/** Клиент /me: параметры цикла через POST client-me. */
import { postClientMe } from './clientSession.js'

/** @returns {Promise<{ ok: boolean, cycle?: object, error?: string }>} */
export function fetchClientCycle() {
  return postClientMe({ action: 'cycle-get' })
}

/**
 * @param {{ cycle_days: number, period_days: number, last_period_start: string }} input
 */
export function upsertClientCycle(input) {
  return postClientMe({
    action: 'cycle-upsert',
    cycle_days: input.cycle_days,
    period_days: input.period_days,
    last_period_start: input.last_period_start,
  })
}

export function disableClientCycle() {
  return postClientMe({ action: 'cycle-disable' })
}
