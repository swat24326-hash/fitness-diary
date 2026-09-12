/**
 * Gate абонемента при открытии черновика тренера.
 * «Новая тренировка» и уже существующий draft (в т.ч. после копирования)
 * должны одинаково предлагать раннюю активацию upcoming, если usable нет.
 * Verify: scripts/verify-training-membership-draft-gate.mjs
 */

/**
 * @param {{
 *   isAdmin?: boolean,
 *   status?: string | null,
 *   isNewTraining?: boolean,
 *   hasMembershipSummary?: boolean,
 *   earlyOfferOk?: boolean,
 *   earlyProposal?: object | null,
 *   lateInspectionStatus?: string | null,
 *   lateProposal?: object | null,
 *   lateBlockedMessage?: string | null,
 * }} input
 * @returns {{
 *   loadState: 'ok' | 'awaiting_activate' | 'no_membership',
 *   shiftMode: 'early' | 'late' | null,
 *   proposal: object | null,
 *   lateDraftOffer: boolean,
 *   lateBlockedNotice: string,
 * }}
 */
export function resolveTrainerDraftMembershipOpenGate(input = {}) {
  const isAdmin = input.isAdmin === true
  const status = String(input.status ?? 'draft')
  const isNewTraining = input.isNewTraining === true
  const hasSummary = input.hasMembershipSummary === true

  if (isAdmin || status !== 'draft') {
    return {
      loadState: 'ok',
      shiftMode: null,
      proposal: null,
      lateDraftOffer: false,
      lateBlockedNotice: '',
    }
  }

  const lateStatus = String(input.lateInspectionStatus ?? '')
  const lateProposal = input.lateProposal ?? null
  const lateMessage = String(input.lateBlockedMessage ?? '').trim()

  if (lateStatus === 'offer' && lateProposal) {
    /* Новая — полноэкранный gate; существующий draft — баннер на форме. */
    return {
      loadState: isNewTraining ? 'awaiting_activate' : 'ok',
      shiftMode: 'late',
      proposal: lateProposal,
      lateDraftOffer: true,
      lateBlockedNotice: '',
    }
  }

  const lateBlockedNotice = lateStatus === 'blocked' ? lateMessage : ''

  if (hasSummary) {
    return {
      loadState: 'ok',
      shiftMode: null,
      proposal: null,
      lateDraftOffer: false,
      lateBlockedNotice,
    }
  }

  if (input.earlyOfferOk === true && input.earlyProposal) {
    return {
      loadState: 'awaiting_activate',
      shiftMode: 'early',
      proposal: input.earlyProposal,
      lateDraftOffer: false,
      lateBlockedNotice: '',
    }
  }

  if (isNewTraining) {
    return {
      loadState: 'no_membership',
      shiftMode: null,
      proposal: null,
      lateDraftOffer: false,
      lateBlockedNotice: '',
    }
  }

  /* Существующий draft без usable и без upcoming: форма остаётся (ensure / Sync / карточка). */
  return {
    loadState: 'ok',
    shiftMode: null,
    proposal: null,
    lateDraftOffer: false,
    lateBlockedNotice,
  }
}

/**
 * «Закончить» не нашёл usable — предложить раннюю активацию вместо голой ошибки.
 * @param {{
 *   planOk?: boolean,
 *   isAdmin?: boolean,
 *   silent?: boolean,
 *   earlyOfferOk?: boolean,
 *   earlyProposal?: object | null,
 * }} input
 */
export function shouldOfferEarlyActivateAfterDebitFail(input = {}) {
  if (input.planOk === true) return false
  if (input.isAdmin === true) return false
  if (input.silent === true) return false
  if (input.earlyOfferOk !== true) return false
  return Boolean(input.earlyProposal)
}
