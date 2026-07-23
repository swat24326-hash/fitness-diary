/**
 * Глубокая проверка логики синхронизации (офлайн-first).
 * node scripts/verify-sync-offline.mjs
 */
import {
  describeFlushQueueResult,
  isDuplicateInsertError,
  isSyncQueueOrphanForCloudClients,
  isUnrecoverablePushError,
  pendingClientInsertIdsFromQueue,
  shouldPreserveLocalRowOnPull,
  collapseMemoryPushBatch,
} from '../src/lib/syncFlushResult.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

/* --- push: безвозвратные vs повторяемые --- */
assert(isUnrecoverablePushError(403, 'Нет доступа к клиенту'), '403 client access -> drop queue')
assert(isUnrecoverablePushError(403, 'Типы абонементов может менять только администратор'), '403 admin-only types')
assert(isUnrecoverablePushError(404, 'Тренировка не найдена'), '404 training -> drop')
assert(!isUnrecoverablePushError(401, 'JWT'), '401 -> retry (session)')
assert(!isUnrecoverablePushError(500, 'internal'), '500 -> retry')
assert(!isUnrecoverablePushError(403, 'forbidden generic'), '403 generic -> retry')
assert(!isUnrecoverablePushError(404, 'not found generic'), '404 generic -> retry')
assert(
  isUnrecoverablePushError(400, 'Укажите дату начала абонемента'),
  '400 membership missing start_date -> drop',
)
assert(!isUnrecoverablePushError(400, 'какой-то другой 400'), '400 generic -> retry')

/* --- duplicate insert --- */
assert(isDuplicateInsertError({ status: 409 }), '409 duplicate')
assert(isDuplicateInsertError({ code: '23505', message: 'duplicate key' }), 'pg unique')
assert(isDuplicateInsertError({ message: 'HTTP 409 conflict' }), 'message 409')
assert(!isDuplicateInsertError({ message: 'network error' }), 'network not duplicate')
assert(!isDuplicateInsertError(null), 'null not duplicate')

/* --- auto-push: insert+delete same entity → keep delete only --- */
{
  const collapsed = collapseMemoryPushBatch([
    { table_name: 'memberships', operation: 'insert', remote_id: null, data: { id: 'm1' }, local_id: 'a' },
    { table_name: 'memberships', operation: 'delete', remote_id: 'm1', data: {}, local_id: 'b' },
  ])
  assert(collapsed.length === 1 && collapsed[0].operation === 'delete', 'memory batch: delete wins over insert')
}
{
  const collapsed = collapseMemoryPushBatch([
    { table_name: 'memberships', operation: 'update', remote_id: 'm2', data: { id: 'm2' }, local_id: 'c' },
    { table_name: 'memberships', operation: 'update', remote_id: 'm2', data: { id: 'm2', used_trainings: 1 }, local_id: 'd' },
  ])
  assert(collapsed.length === 1 && collapsed[0].data.used_trainings === 1, 'memory batch: keep last update')
}
{
  const collapsed = collapseMemoryPushBatch([
    {
      table_name: 'memberships',
      operation: 'insert',
      remote_id: null,
      data: { id: 'm3', start_date: '2026-08-01', end_date: '2026-08-31' },
      local_id: 'e',
    },
    {
      table_name: 'memberships',
      operation: 'update',
      remote_id: 'm3',
      data: { id: 'm3', start_date: '2026-07-13', end_date: '2026-08-12' },
      local_id: 'f',
    },
  ])
  assert(collapsed.length === 1 && collapsed[0].operation === 'insert', 'memory batch: fold update into insert')
  assert(collapsed[0].data.start_date === '2026-07-13', 'memory batch: early-activate dates win')
}

/* --- flush UI --- */
{
  const ok = describeFlushQueueResult({ ok: true, remaining: 0 })
  assert(ok.part === 'очередь отправлена' && !ok.hadError, 'flush empty queue = success')
}
{
  const pending = describeFlushQueueResult({ ok: false, reason: 'pending_items', remaining: 3 })
  assert(pending.hadError && pending.part.includes('не отправлено') && pending.part.includes('3'), 'pending_items shows count')
}
{
  const off = describeFlushQueueResult({ ok: false, reason: 'offline_or_stub' })
  assert(off.offline && off.message.includes('офлайн'), 'offline stub friendly')
}
{
  const t = describeFlushQueueResult({ ok: false, reason: 'timeout', remaining: 2 })
  assert(t.hadError && t.part.includes('осталось 2'), 'timeout + remaining')
}
{
  const manual = describeFlushQueueResult({ ok: false, reason: 'manual_only' })
  assert(manual.hadError, 'manual_only not silent success')
}
{
  const busy = describeFlushQueueResult({ ok: false, reason: 'busy' })
  assert(busy.hadError && busy.part.includes('отправ'), 'busy is warning')
}
{
  const tBg = describeFlushQueueResult({ ok: false, reason: 'timeout', remaining: 5, stillRunning: true })
  assert(tBg.hadError && tBg.part.includes('продолжается'), 'timeout still running hint')
}

/* --- orphan purge (офлайн insert не трогаем) --- */
{
  const cloudIds = new Set(['aaa'])
  const pendingInsert = { table_name: 'clients', operation: 'insert', data: { id: 'bbb' } }
  assert(!isSyncQueueOrphanForCloudClients(pendingInsert, cloudIds), 'offline client insert kept')
}
{
  const pendingTrainingInsert = {
    table_name: 'trainings',
    operation: 'insert',
    data: { client_id: 'new-local', id: 't1' },
  }
  assert(!isSyncQueueOrphanForCloudClients(pendingTrainingInsert, new Set(['aaa'])), 'offline training insert kept')
}
{
  const staleUpdate = { table_name: 'trainings', operation: 'update', data: { client_id: 'gone' } }
  assert(isSyncQueueOrphanForCloudClients(staleUpdate, new Set(['aaa'])), 'stale update for missing client')
}
{
  const pendingDelete = { table_name: 'memberships', operation: 'delete', remote_id: 'm1', data: { client_id: 'gone' } }
  assert(!isSyncQueueOrphanForCloudClients(pendingDelete, new Set()), 'delete never purged from queue')
}
{
  const pendingClientUpdate = {
    table_name: 'clients',
    operation: 'update',
    data: { id: 'new-local', name: 'A' },
  }
  const q = [
    { table_name: 'clients', operation: 'insert', data: { id: 'new-local' } },
    pendingClientUpdate,
  ]
  const pending = pendingClientInsertIdsFromQueue(q)
  assert(!isSyncQueueOrphanForCloudClients(pendingClientUpdate, new Set(['other']), pending), 'update for pending insert client kept')
}

/* --- pull merge guard --- */
{
  const pending = new Set(['ch-1'])
  assert(shouldPreserveLocalRowOnPull(pending, 'ch-1', { id: 'ch-1' }), 'preserve local challenge on pull')
  assert(shouldPreserveLocalRowOnPull(pending, 'ch-1', null), 'pending delete without local -> block restore')
  assert(!shouldPreserveLocalRowOnPull(new Set(), 'ch-1', { id: 'ch-1' }), 'no pending -> apply pull')
  assert(!shouldPreserveLocalRowOnPull(pending, '', { id: 'x' }), 'empty id -> apply pull')
}

/* --- таблицы вне orphan-логики --- */
{
  const exInsert = { table_name: 'exercises', operation: 'insert', data: { id: 'e1' } }
  assert(!isSyncQueueOrphanForCloudClients(exInsert, new Set()), 'exercises insert not orphan-purged')
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll sync offline-first checks passed.')
