/**
 * Ошибка pull в ручном Sync — в журнал внимания, не в тост очереди.
 */

import { recordAppError } from './appErrorJournal.js'

export function recordSyncPullIssue(label, error) {
  const msg = String(error ?? 'ошибка').trim() || 'ошибка'
  recordAppError({
    source: 'pull',
    error: `${label}: ${msg}`,
    status: /нет доступа/i.test(msg) ? 403 : undefined,
  })
}
