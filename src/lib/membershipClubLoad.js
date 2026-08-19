/**
 * Абонементы клуба для статистики: API → локальный кэш.
 */

import { fetchMembershipsForClubViaAdminApi } from './admin/adminApiClient'
import { listMembershipsByClubId } from './localDbClubQuery'

/**
 * @param {string | null | undefined} clubId
 * @returns {Promise<object[]>}
 */
export async function loadClubMembershipsWithApiFallback(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  try {
    const via = await fetchMembershipsForClubViaAdminApi(cid)
    if (via?.memberships?.length) return via.memberships
  } catch {
    /* локальный кэш */
  }
  try {
    return await listMembershipsByClubId(cid)
  } catch {
    return []
  }
}
