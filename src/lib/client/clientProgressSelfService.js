/** Клиент /me: запись своего веса и обмеров через POST client-me. */
import { postClientMe } from './clientSession.js'

/**
 * @param {{ date: string, kg: number, id?: string }} input
 * @returns {Promise<{ ok: boolean, progress?: object, as_of?: string, id?: string, error?: string }>}
 */
export function upsertClientSelfWeight(input) {
  return postClientMe({
    action: 'progress-weight-upsert',
    date: input.date,
    kg: input.kg,
    ...(input.id ? { id: input.id } : {}),
  })
}

/** @param {string} id */
export function deleteClientSelfWeight(id) {
  return postClientMe({ action: 'progress-weight-delete', id })
}

/**
 * @param {{ date: string, values: Record<string, number>, id?: string }} input
 */
export function upsertClientSelfMeasure(input) {
  return postClientMe({
    action: 'progress-measure-upsert',
    date: input.date,
    values: input.values,
    ...(input.id ? { id: input.id } : {}),
  })
}

/** @param {string} id */
export function deleteClientSelfMeasure(id) {
  return postClientMe({ action: 'progress-measure-delete', id })
}
