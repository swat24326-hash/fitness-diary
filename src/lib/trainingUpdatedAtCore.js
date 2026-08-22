/**
 * Локальная ревизия trainings для merge при pull (до ответа сервера).
 */

/**
 * @param {object | null | undefined} record
 * @param {string} [nowIso]
 * @returns {object | null | undefined}
 */
export function stampTrainingUpdatedAt(record, nowIso = new Date().toISOString()) {
  if (!record || typeof record !== 'object') return record
  const ts = typeof nowIso === 'string' && nowIso.trim() ? nowIso.trim() : new Date().toISOString()
  return { ...record, updated_at: ts }
}
