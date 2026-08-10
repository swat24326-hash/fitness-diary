/**
 * Побочные эффекты смены тренера ПЗ на карточке (confirm + club_id).
 */

import {
  clubMoveConfirmMessage,
  needsCardUniquenessCheckOnClubMove,
  resolveClientClubIdForTrainer,
  tabletModeChangeConfirmMessage,
} from './clientTrainerReassignCore.js'
import { assertClubCardAvailableForCreate } from './salesClientMatchCore.js'
import { listClientsByClubId } from '../localDbClubQuery.js'

/**
 * @param {{
 *   client: object,
 *   nextTrainerId: string|null,
 *   trainersCatalog?: object[],
 *   confirmFn?: (msg: string) => boolean,
 * }} opts
 * @returns {Promise<{ ok: true, trainer_id: string|null, club_id: string|null } | { ok: false, cancelled?: boolean, error?: string }>}
 */
export async function prepareClientTrainerReassign({
  client,
  nextTrainerId,
  trainersCatalog = [],
  confirmFn = typeof window !== 'undefined' ? window.confirm.bind(window) : () => true,
}) {
  const prevTid = String(client?.trainer_id ?? '').trim()
  const nextTid = String(nextTrainerId ?? '').trim()
  const catalog = Array.isArray(trainersCatalog) ? trainersCatalog : []
  const find = (id) => catalog.find((t) => String(t?.id ?? '') === String(id))

  if (!nextTid) {
    return {
      ok: true,
      trainer_id: null,
      club_id: client?.club_id ?? null,
    }
  }

  if (nextTid === prevTid) {
    return {
      ok: true,
      trainer_id: nextTid,
      club_id: client?.club_id ?? null,
    }
  }

  const fromTrainer = find(prevTid)
  const toTrainer = find(nextTid)
  const modeMsg = tabletModeChangeConfirmMessage({ fromTrainer, toTrainer })
  if (modeMsg && !confirmFn(modeMsg)) {
    return { ok: false, cancelled: true }
  }

  const nextClubId = resolveClientClubIdForTrainer({
    clientClubId: client?.club_id,
    trainerRow: toTrainer,
  })
  const clubMsg = clubMoveConfirmMessage({
    oldClubId: client?.club_id,
    newClubId: nextClubId,
    trainerName: toTrainer?.name || toTrainer?.login,
  })
  if (clubMsg && !confirmFn(clubMsg)) {
    return { ok: false, cancelled: true }
  }

  if (
    needsCardUniquenessCheckOnClubMove({
      oldClubId: client?.club_id,
      newClubId: nextClubId,
      cardNumber: client?.card_number,
    })
  ) {
    try {
      const clubClients = await listClientsByClubId(nextClubId)
      const cardCheck = assertClubCardAvailableForCreate(
        clubClients,
        nextClubId,
        String(client.card_number ?? '').trim(),
        { excludeClientId: client.id },
      )
      if (!cardCheck.ok) {
        return { ok: false, error: cardCheck.error }
      }
    } catch {
      /* офлайн — облако отловит unique */
    }
  }

  return {
    ok: true,
    trainer_id: nextTid,
    club_id: nextClubId,
  }
}
