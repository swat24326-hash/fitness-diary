/**
 * Gate абонемента черновика: inspection + pure resolve (IDB через shift service).
 */
import {
  loadEarlyActivationProposal,
  loadLateStartInspection,
} from './membershipStartShiftService.js'
import { resolveTrainerDraftMembershipOpenGate } from './trainingMembershipDraftGateCore.js'

/**
 * @param {{
 *   clientId: string,
 *   day: string,
 *   hasMembershipSummary: boolean,
 *   isAdmin?: boolean,
 *   status?: string | null,
 *   isNewTraining?: boolean,
 * }} opts
 */
export async function inspectTrainerDraftMembershipOpenGate(opts) {
  const clientId = String(opts.clientId ?? '').trim()
  const day = String(opts.day ?? '').slice(0, 10)
  const isAdmin = opts.isAdmin === true
  const status = String(opts.status ?? 'draft')
  const isNewTraining = opts.isNewTraining === true
  const hasMembershipSummary = opts.hasMembershipSummary === true

  if (isAdmin || status !== 'draft' || !clientId || !day) {
    return resolveTrainerDraftMembershipOpenGate({
      isAdmin,
      status,
      isNewTraining,
      hasMembershipSummary,
    })
  }

  const lateInsp = await loadLateStartInspection(clientId, day)
  let earlyOfferOk = false
  let earlyProposal = null
  if (!hasMembershipSummary && lateInsp.status !== 'offer') {
    const early = await loadEarlyActivationProposal(clientId, day)
    earlyOfferOk = early.ok === true
    earlyProposal = early.proposal ?? null
  }

  return resolveTrainerDraftMembershipOpenGate({
    isAdmin,
    status,
    isNewTraining,
    hasMembershipSummary,
    earlyOfferOk,
    earlyProposal,
    lateInspectionStatus: lateInsp.status,
    lateProposal: lateInsp.proposal ?? null,
    lateBlockedMessage: lateInsp.message ?? '',
  })
}
