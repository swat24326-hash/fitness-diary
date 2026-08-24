/**
 * Durable-снимок черновика тренировки в localStorage (синхронно переживает kill вкладки).
 * Не sync_queue / не облако — только мост «экран → диск» при блокировке.
 */

import {
  buildTrainingDraftDurableSnap,
  resolveTrainingDraftDurableKey,
} from './trainingDraftDurableCore.js'

const STORAGE_PREFIX = 'fitness-diary-training-draft-v1:'

/** @param {string} key */
function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

/**
 * @param {{ trainingId?: string | null, clientId?: string | null, isNew?: boolean }} keyOpts
 * @param {object} fields — см. buildTrainingDraftDurableSnap
 * @returns {boolean}
 */
export function putTrainingDraftDurable(keyOpts, fields) {
  const key = resolveTrainingDraftDurableKey(keyOpts)
  if (!key || typeof localStorage === 'undefined') return false
  const snap = buildTrainingDraftDurableSnap({
    ...fields,
    trainingId: keyOpts.trainingId ?? fields.trainingId,
    clientId: keyOpts.clientId ?? fields.clientId,
  })
  if (!snap) return false
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(snap))
    return true
  } catch {
    return false
  }
}

/**
 * @param {{ trainingId?: string | null, clientId?: string | null, isNew?: boolean }} keyOpts
 * @returns {object | null}
 */
export function readTrainingDraftDurable(keyOpts) {
  const key = resolveTrainingDraftDurableKey(keyOpts)
  if (!key || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * @param {{ trainingId?: string | null, clientId?: string | null, isNew?: boolean }} keyOpts
 * @returns {boolean}
 */
export function clearTrainingDraftDurable(keyOpts) {
  const key = resolveTrainingDraftDurableKey(keyOpts)
  if (!key || typeof localStorage === 'undefined') return false
  try {
    localStorage.removeItem(storageKey(key))
    return true
  } catch {
    return false
  }
}

/**
 * После первого save /new → uuid: перенести снимок.
 * @param {string} clientId
 * @param {string} trainingId
 */
export function migrateTrainingDraftDurableNewToId(clientId, trainingId) {
  const fromKey = resolveTrainingDraftDurableKey({ clientId, isNew: true })
  const toKey = resolveTrainingDraftDurableKey({ trainingId })
  if (!fromKey || !toKey || fromKey === toKey || typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(storageKey(fromKey))
    if (!raw) return false
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false
    parsed.trainingId = String(trainingId).trim()
    parsed.revisedAt = parsed.revisedAt || new Date().toISOString()
    localStorage.setItem(storageKey(toKey), JSON.stringify(parsed))
    localStorage.removeItem(storageKey(fromKey))
    return true
  } catch {
    return false
  }
}
