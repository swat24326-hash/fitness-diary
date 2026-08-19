/**
 * Абонементы клуба для статистики: API по роли → локальный кэш.
 * Тренер — только trainer-pull (не list-memberships: там admin/sales).
 */

import { fetchMembershipsForClubViaAdminApi } from './admin/adminApiClient'
import { fetchTrainerPullViaApi } from './syncApiClient'
import { listMembershipsByClubId } from './localDbClubQuery'

/**
 * @param {string | null | undefined} clubId
 * @param {{ trainerId?: string | null }} [opts]
 * @returns {Promise<object[]>}
 */
export async function loadClubMembershipsWithApiFallback(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const trainerId = String(opts.trainerId ?? '').trim()

  if (trainerId) {
    try {
      const via = await fetchTrainerPullViaApi({ skipTrainings: true })
      if (via?.memberships?.length) return via.memberships
    } catch {
      /* локальный кэш */
    }
  } else {
    try {
      const via = await fetchMembershipsForClubViaAdminApi(cid)
      if (via?.memberships?.length) return via.memberships
    } catch {
      /* локальный кэш */
    }
  }

  try {
    return await listMembershipsByClubId(cid)
  } catch {
    return []
  }
}
