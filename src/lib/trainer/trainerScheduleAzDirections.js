/**
 * Направления АЗ клуба для формы «Групповое» в ежедневнике.
 */
import { ensureMembershipTypesForClub } from '../membershipTypesService.js'

/**
 * @param {unknown} clubId
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function listScheduleAzDirections(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  try {
    const res = await ensureMembershipTypesForClub(cid, { aerobicOnly: true, activeOnly: true })
    const types = Array.isArray(res?.types) ? res.types : Array.isArray(res) ? res : []
    return types
      .map((t) => ({
        id: String(t?.id ?? '').trim(),
        name: String(t?.name ?? t?.code ?? '').trim() || 'АЗ',
      }))
      .filter((t) => t.id)
  } catch {
    return []
  }
}
