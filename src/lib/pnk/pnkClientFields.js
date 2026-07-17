/** Поля ПНК на clients — нормализация для push / API. */

import {
  buildNewPnkClientFields,
  isClientLifecycle,
  isPnkStage,
  parsePnkComments,
  parsePnkDeliverables,
} from './pnkStagesCore.js'
import { normalizePnkTrialSessions } from './pnkWizardCore.js'

export const CLIENT_PNK_DB_FIELDS = [
  'lifecycle',
  'pnk_stage',
  'pnk_source',
  'pnk_trial_sessions',
  'pnk_trial_date',
  'pnk_trial_time',
  'pnk_comment',
  'pnk_comments',
  'pnk_deliverables',
  'pnk_won_at',
  'pnk_lost_at',
  'pnk_lost_reason',
  'pnk_created_at',
]

/**
 * @param {object | null | undefined} row
 */
export function pickClientPnkFields(row) {
  const out = {}
  for (const key of CLIENT_PNK_DB_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row ?? {}, key) && row[key] !== undefined) {
      out[key] = row[key]
    }
  }
  return out
}

/**
 * @param {object} row
 */
export function normalizeClientPnkFields(row) {
  const stageHint = isPnkStage(row?.pnk_stage) ? row.pnk_stage : null
  let lifecycle = isClientLifecycle(row?.lifecycle) ? row.lifecycle : null
  if (!lifecycle) {
    if (stageHint === 'won') lifecycle = 'active'
    else if (stageHint === 'lost') lifecycle = 'pnk_lost'
    else if (stageHint || row?.pnk_created_at || row?.pnk_deliverables) lifecycle = 'pnk'
    else lifecycle = 'active'
  }
  const stage = stageHint ?? (lifecycle === 'pnk' ? 'new' : null)
  return {
    ...row,
    lifecycle,
    pnk_stage: stage,
    pnk_source: row?.pnk_source != null ? String(row.pnk_source).slice(0, 40) : null,
    pnk_trial_sessions: normalizePnkTrialSessions(row?.pnk_trial_sessions),
    pnk_trial_date: row?.pnk_trial_date ? String(row.pnk_trial_date).slice(0, 10) : null,
    pnk_trial_time: row?.pnk_trial_time ? String(row.pnk_trial_time).trim().slice(0, 8) : null,
    pnk_comment: row?.pnk_comment != null ? String(row.pnk_comment).slice(0, 500) : null,
    pnk_comments: parsePnkComments(row?.pnk_comments),
    pnk_deliverables: parsePnkDeliverables(row?.pnk_deliverables),
    pnk_won_at: row?.pnk_won_at ?? null,
    pnk_lost_at: row?.pnk_lost_at ?? null,
    pnk_lost_reason: row?.pnk_lost_reason != null ? String(row.pnk_lost_reason).slice(0, 200) : null,
    pnk_created_at: row?.pnk_created_at ?? null,
  }
}

/**
 * @param {object} base
 */
export function mergeNewPnkOntoClient(base) {
  return normalizeClientPnkFields({
    ...base,
    ...buildNewPnkClientFields(base),
  })
}
