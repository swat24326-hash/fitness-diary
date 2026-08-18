/**
 * Побочные эффекты смены тренера ПЗ на карточке (confirm + club_id).
 */

import { clubMoveConfirmMessage, needsCardUniquenessCheckOnClubMove, resolveCardNumberForClubMoveCheck, resolveClientClubIdForTrainer, tabletModeChangeConfirmMessage } from './clientTrainerReassignCore.js'
import { loyaltyClubMoveWarnText } from '../loyalty/loyaltyClientMutationCore.js'
import { assertClubCardAvailableForCreate } from './salesClientMatchCore.js'
import { listClientsByClubId as listClientsByClubIdDefault } from '../localDbClubQuery.js'

/**
 * @param {{
 *   client: object,
 *   nextTrainerId: string|null,
 *   proposedCardNumber?: string|null,
 *   trainersCatalog?: object[],
 *   confirmFn?: (msg: string) => boolean,
 *   loyaltyWarnFn?: (client: object) => Promise<string>,
 *   listClientsByClubIdFn?: (clubId: string) => Promise<object[]>,
 * }} opts
 * @returns {Promise<{ ok: true, trainer_id: string|null, club_id: string|null } | { ok: false, cancelled?: boolean, error?: string }>}
 */
export async function prepareClientTrainerReassign({
  client,
  nextTrainerId,
  proposedCardNumber,
  trainersCatalog = [],
  confirmFn = typeof window !== 'undefined' ? window.confirm.bind(window) : () => true,
  loyaltyWarnFn = null,
  listClientsByClubIdFn = listClientsByClubIdDefault,
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
  let loyaltyNote = ''
  const willMove = Boolean(
    clubMoveConfirmMessage({
      oldClubId: client?.club_id,
      newClubId: nextClubId,
      trainerName: toTrainer?.name || toTrainer?.login,
    }),
  )
  if (willMove) {
    try {
      if (typeof loyaltyWarnFn === 'function') {
        loyaltyNote = String((await loyaltyWarnFn(client)) ?? '').trim()
      } else if (typeof window !== 'undefined') {
        const { loadLoyaltyWarnSnapshot } = await import('../loyalty/loyaltyWarnService.js')
        const snap = await loadLoyaltyWarnSnapshot(client)
        if (snap.show) loyaltyNote = loyaltyClubMoveWarnText(snap)
      }
    } catch {
      loyaltyNote = loyaltyClubMoveWarnText({ known: false })
    }
  }
  const clubMsg = clubMoveConfirmMessage({
    oldClubId: client?.club_id,
    newClubId: nextClubId,
    trainerName: toTrainer?.name || toTrainer?.login,
    loyaltyNote,
  })
  if (clubMsg && !confirmFn(clubMsg)) {
    return { ok: false, cancelled: true }
  }

  const cardForCheck = resolveCardNumberForClubMoveCheck({
    proposedCardNumber,
    clientCardNumber: client?.card_number,
  })
  if (
    needsCardUniquenessCheckOnClubMove({
      oldClubId: client?.club_id,
      newClubId: nextClubId,
      cardNumber: cardForCheck,
    })
  ) {
    try {
      const clubClients = await listClientsByClubIdFn(nextClubId)
      const cardCheck = assertClubCardAvailableForCreate(clubClients, nextClubId, cardForCheck, {
        excludeClientId: client.id,
      })
      if (!cardCheck.ok) {
        return { ok: false, error: cardCheck.error }
      }
    } catch {
      return {
        ok: false,
        error:
          'Не удалось проверить № карты в новом клубе. Нажмите Sync и повторите смену тренера.',
      }
    }
  }

  return {
    ok: true,
    trainer_id: nextTid,
    club_id: nextClubId,
  }
}
