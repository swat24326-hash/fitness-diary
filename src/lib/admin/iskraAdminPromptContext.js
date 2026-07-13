/**
 * Расширенный контекст промпта для app_admin (standard / deep).
 */

import { iskraAdminRichContext } from './iskraResponseModeCore.js'
import { compactOpenDispatchForPrompt } from './iskraDispatchCore.js'
import { buildMonthMemoryBlock } from './iskraMonthMemoryCore.js'
/**
 * @param {object | null | undefined} snapshot
 */
export function buildTrainersSummaryForPrompt(snapshot) {
  const trainers = snapshot?.trainer_contour?.trainers ?? []
  return trainers.slice(0, 25).map((t) => ({
    trainer_id: t.trainer_id,
    trainer_name: t.trainer_name,
    completed_trainings: t.completed_trainings,
    personal_salary_month: t.personal_salary_month,
    active_clients_total: t.active_clients_total,
    inactive_clients_holders: t.inactive_clients_holders,
    no_type_trainings_ignored: t.no_type_trainings_ignored,
  }))
}

/**
 * @param {object} block
 * @param {object | null | undefined} snapshot
 * @param {{
 *   responseMode?: string,
 *   dispatchOpen?: object[],
 *   previousSnapshot?: object | null,
 *   playbooks?: Array<{ signal_key: string, note: string }> | null,
 * }} [opts]
 */
export function augmentPromptDataBlockForAdmin(block, snapshot, opts = {}) {
  const mode = String(opts.responseMode ?? 'brief')
  if (!iskraAdminRichContext(/** @type {import('./iskraResponseModeCore.js').IskraResponseMode} */ (mode))) {
    return block
  }

  const next = { ...block }

  if (snapshot?.trainer_contour?.trainers?.length) {
    next.trainers_summary = buildTrainersSummaryForPrompt(snapshot)
  }

  if (mode === 'deep' && snapshot?.trainer_contour?.club_roll_up) {
    next.trainer_contour = {
      ...(next.trainer_contour ?? {}),
      club_roll_up: snapshot.trainer_contour.club_roll_up,
    }
  }

  if (mode === 'deep' && snapshot?.sales?.direction_structure) {
    next.sales_contour = {
      ...(next.sales_contour ?? {}),
      direction_structure: snapshot.sales.direction_structure,
      extra_sales_rub: snapshot.sales.extra_sales_rub,
    }
  }

  const monthMemory = buildMonthMemoryBlock(snapshot, opts.previousSnapshot)
  if (monthMemory) next.month_memory = monthMemory

  const playbooks = Array.isArray(opts.playbooks) ? opts.playbooks : []
  if (playbooks.length) next.club_playbooks = playbooks

  const openDispatch = compactOpenDispatchForPrompt(opts.dispatchOpen)
  if (openDispatch.length) next.open_dispatch_tasks = openDispatch

  return next
}
