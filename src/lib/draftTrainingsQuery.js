/**
 * Черновики тренировок для DraftTabsBar — без getAll по всей базе.
 */

import {
  getClientsMapByIdsLocal,
  listTrainingsByClubIdInRange,
  listTrainingsByTrainerId,
} from './localDbClubQuery.js'

/** @param {object} t */
export function isDraftTrainingRow(t) {
  return String(t?.status ?? '') === 'draft'
}

const WIDE_FROM = '1970-01-01'
const WIDE_TO = '2999-12-31'

/**
 * @param {{ userId: string, isAdmin?: boolean, adminClubId?: string, cap?: number }} p
 */
export async function loadDraftTrainingsForBar(p) {
  const userId = String(p?.userId ?? '').trim()
  if (!userId) return { drafts: [], clientById: {} }

  const cap = Math.max(1, p?.cap ?? 25)
  let base = []

  if (p?.isAdmin) {
    const clubId = String(p?.adminClubId ?? '').trim()
    if (!clubId) return { drafts: [], clientById: {} }
    base = await listTrainingsByClubIdInRange(clubId, WIDE_FROM, WIDE_TO)
  } else {
    base = await listTrainingsByTrainerId(userId)
  }

  const draftRows = (base ?? [])
    .filter((t) => isDraftTrainingRow(t))
    .filter((t) => (p?.isAdmin ? true : String(t.trainer_id) === userId))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  const drafts = p?.isAdmin ? draftRows.slice(0, cap) : draftRows
  const clientIds = drafts.map((t) => t.client_id).filter(Boolean)
  const clientById = await getClientsMapByIdsLocal(clientIds)
  const visible = drafts.filter((t) => clientById[t.client_id])

  return { drafts: visible, clientById }
}
