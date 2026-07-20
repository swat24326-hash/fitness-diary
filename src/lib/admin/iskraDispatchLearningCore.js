/**
 * Связка Планёрки → самообучение ИСКРЫ (слой D).
 * Чистые функции — verify-iskra-learning.mjs.
 */

import { buildLearningSignalKey } from './iskraLearningCore.js'

/**
 * @param {'assign' | 'done' | 'dismiss' | 'declined'} action
 * @param {{ insightKey?: string | null, kind?: string | null, taskKind?: string | null }} meta
 */
export function buildDispatchLearningSignalKey(action, meta = {}) {
  const insight = String(meta.insightKey ?? '').trim()
  if (insight) return buildLearningSignalKey('dispatch', `${action}_${insight}`)
  const kind = String(meta.taskKind ?? meta.kind ?? 'task').trim() || 'task'
  return buildLearningSignalKey('dispatch', `${action}_${kind}`)
}

/**
 * @param {{
 *   clubId: string,
 *   action: 'assign' | 'done' | 'dismiss' | 'declined',
 *   insightKey?: string | null,
 *   kind?: string | null,
 *   taskKind?: string | null,
 *   title?: string | null,
 *   advisorRoleId?: string,
 * }} opts
 * @returns {object | null} raw learning event for normalizeLearningEvent
 */
export function buildDispatchLearningEvent(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const action = String(opts.action ?? '').trim()
  if (!clubId || !['assign', 'done', 'dismiss', 'declined'].includes(action)) return null

  const eventType =
    action === 'assign'
      ? 'dispatch_assign'
      : action === 'done'
        ? 'dispatch_done'
        : 'dispatch_dismiss'

  const title = String(opts.title ?? '').trim().slice(0, 120)
  const note =
    action === 'assign'
      ? `Назначено задание${title ? `: ${title}` : ''} — тема полезна.`
      : action === 'done'
        ? `Задание выполнено${title ? `: ${title}` : ''} — усиливать такие советы.`
        : `Задание отклонено/скрыто${title ? `: ${title}` : ''} — меньше таких советов.`

  return {
    club_id: clubId,
    event_type: eventType,
    signal_key: buildDispatchLearningSignalKey(action, opts),
    advisor_role_id: String(opts.advisorRoleId ?? 'app_admin').trim() || 'app_admin',
    user_message: '',
    note,
    created_at: new Date().toISOString(),
    meta: {
      source: 'planerka',
      action,
      insight_key: opts.insightKey ?? null,
      task_kind: opts.taskKind ?? opts.kind ?? null,
    },
  }
}
