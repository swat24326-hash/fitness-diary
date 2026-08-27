/**
 * Smoke-test журнала ошибок (Node, без DOM).
 * Запуск: node scripts/verify-app-error-journal.mjs
 */

import assert from 'node:assert/strict'

// Минимальный localStorage + window для модуля
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
}
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
}

const {
  recordAppError,
  getAppErrors,
  getAppErrorCount,
  clearAppErrors,
  recordSyncError,
  isRecoverableTransientError,
  clearRecoverableAppErrors,
  reportSyncOutcome,
  getPersistentErrorCount,
  computeNeedsUserAttention,
} = await import('../src/lib/appErrorJournal.js')

clearAppErrors()
assert.equal(getAppErrorCount(), 0)

recordAppError({ source: 'app', error: 'Test A' })
assert.equal(getAppErrorCount(), 1)
assert.equal(getAppErrors(1)[0].error, 'Test A')

recordAppError({ source: 'app', error: 'Test A' })
assert.equal(getAppErrorCount(), 1, 'dedupe within 5s')

recordSyncError({ status: 400, error: 'HTTP fail', table_name: 'trainings', operation: 'insert' })
const syncRow = getAppErrors(5).find((r) => r.source === 'sync')
assert.ok(syncRow, 'sync error recorded')
assert.equal(syncRow.context, 'trainings · insert')

// legacy migration (не вызывать clearAppErrors — он удаляет и старый ключ)
store.set(
  'fitness-diary-sync-errors-v1',
  JSON.stringify([{ at: '2020-01-01T00:00:00.000Z', error: 'legacy', table_name: 'x', operation: 'y' }]),
)
recordAppError({ source: 'network', error: 'trigger migrate' })
const legacy = getAppErrors(20).some((r) => r.error === 'legacy')
assert.ok(legacy, 'legacy sync errors migrated')

clearAppErrors()
assert.equal(getAppErrorCount(), 0)

recordAppError({ source: 'network', error: 'Нет сети — синхронизация отложена' })
recordSyncError({ status: 0, error: 'Сеть недоступна', table_name: 'trainings', operation: 'insert' })
assert.equal(getAppErrorCount(), 2)
assert.ok(isRecoverableTransientError(getAppErrors(1)[0]))

reportSyncOutcome({ queueCount: 0, hadError: false })
assert.equal(getAppErrorCount(), 0, 'recoverable cleared after successful sync')
assert.equal(computeNeedsUserAttention(0), false)

recordAppError({
  source: 'pull',
  error: 'рабочая область: Нет связи с сервером — показаны данные с устройства',
})
assert.ok(isRecoverableTransientError(getAppErrors(1)[0]), 'pull offline fallback is recoverable')
reportSyncOutcome({ queueCount: 0, hadError: true })
assert.equal(getAppErrorCount(), 1, 'recoverable pull stays while Sync had remarks')
assert.equal(computeNeedsUserAttention(0), true)

reportSyncOutcome({ queueCount: 0, hadError: false })
assert.equal(getAppErrorCount(), 0, 'recoverable pull cleared after clean Sync')
assert.equal(computeNeedsUserAttention(0), false)

recordAppError({
  source: 'pull',
  error: 'челленджи: Таймаут связи с сервером',
})
assert.ok(isRecoverableTransientError(getAppErrors(1)[0]), 'russian timeout is recoverable')
reportSyncOutcome({ queueCount: 0, hadError: false })
assert.equal(getAppErrorCount(), 0, 'таймаут cleared after successful sync')

recordSyncError({ status: 400, error: 'HTTP fail', table_name: 'trainings', operation: 'insert' })
reportSyncOutcome({ queueCount: 0, hadError: false })
assert.equal(getPersistentErrorCount(), 1, 'server errors stay after sync ok')
assert.equal(computeNeedsUserAttention(0), true)

clearAppErrors()
reportSyncOutcome({ queueCount: 3, hadError: true })
assert.equal(computeNeedsUserAttention(3), true)

clearRecoverableAppErrors()
assert.equal(getAppErrorCount(), 0)

console.log('verify-app-error-journal: OK')
