/**
 * Цена пакета на абонементе (memberships.paid_amount) — мост до домена payment.
 * UI: AdminMembershipPaidAmountField / MembershipManager showPaidAmount.
 */

import {
  formatDeskPaidAmountRu,
  parseDeskPaidAmountInput,
} from './deskMembershipLedgerCore.js'

/** @param {unknown} raw */
export function paidAmountFromMembershipForm(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  return parseDeskPaidAmountInput(raw)
}

/** @param {unknown} amount */
export function formatMembershipPaidAmountCell(amount) {
  return formatDeskPaidAmountRu(amount)
}
