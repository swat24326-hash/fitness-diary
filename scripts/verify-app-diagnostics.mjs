/**
 * Smoke-test диагностики (Node).
 * node scripts/verify-app-diagnostics.mjs
 */

import assert from 'node:assert/strict'
import {
  buildDiagnosticReport,
  buildSystemState,
  filterAppErrors,
  suggestErrorHint,
  formatSyncQueueLine,
  formatSyncQueueLineHuman,
  resolveQuickFixes,
} from '../src/lib/appDiagnostics.js'
import { isViteStaleChunkError } from '../src/lib/viteChunkReload.js'

const system = buildSystemState({
  user: { name: 'Test', email: 't@x.com', id: 'u1' },
  isAdmin: true,
  online: true,
  supabaseReady: true,
  clubId: 'c1',
  clubName: 'Club',
  pathname: '/admin/diagnostics',
  errorCount: 1,
  queueCount: 2,
})

assert.equal(system.role, 'admin')
assert.equal(system.clubName, 'Club')

const errors = [
  { at: '2025-01-01T12:00:00.000Z', source: 'sync', error: 'violates check constraint trainings_type_check', status: 400, context: 'trainings · insert' },
  { at: '2025-01-01T11:00:00.000Z', source: 'network', error: 'Failed to fetch' },
]

assert.equal(filterAppErrors(errors, 'sync').length, 1)
assert.ok(suggestErrorHint(errors[0]).includes('Обновите'))
assert.ok(suggestErrorHint(errors[1]).includes('сет'))
assert.ok(
  suggestErrorHint({
    source: 'pull',
    error: 'справочник: AbortError: Lock broken by another request with the steal option.',
  }).includes('Параллельный'),
  'idb lock hint',
)
assert.ok(
  suggestErrorHint({
    source: 'app',
    error:
      'Uncaught TypeError: Failed to fetch dynamically imported module: https://x/assets/PwaUpdatePrompt-CORITAdj.js',
  }).includes('Ctrl+F5'),
  'chunk load hint',
)

const chunkFixes = resolveQuickFixes({
  errors: [
    {
      source: 'app',
      error: 'Failed to fetch dynamically imported module: PwaUpdatePrompt-CORITAdj.js',
    },
  ],
  queue: [],
  system: { online: true },
})
assert.ok(chunkFixes.some((f) => f.id === 'reload'), 'chunk load quick fix reload')

assert.ok(
  isViteStaleChunkError(
    new Error('Failed to fetch dynamically imported module: https://x/assets/PwaUpdatePrompt-CORITAdj.js'),
  ),
  'stale chunk detector',
)
assert.ok(
  isViteStaleChunkError(
    new Error('Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'),
  ),
  'mime html as js is stale chunk',
)
assert.ok(
  isViteStaleChunkError(new Error("Cannot read properties of undefined (reading 'PwaUpdatePrompt')")),
  'broken lazy export is stale chunk',
)
assert.ok(!isViteStaleChunkError(new Error('Failed to fetch')), 'ordinary network is not chunk')

const queue = [{ table_name: 'trainings', operation: 'insert', local_id: 'abc', retry_count: 1 }]
assert.ok(formatSyncQueueLine(queue[0], 0).includes('trainings'))

const queueWithErr = [
  {
    table_name: 'client_weight_entries',
    operation: 'update',
    retry_count: 10,
    last_error: 'Сеть недоступна',
    data: { client_id: 'c1' },
  },
]
const humanLine = formatSyncQueueLineHuman(queueWithErr[0], 0, { clientNames: { c1: 'Семенов Д.А.' } })
assert.ok(humanLine.includes('Вес'), 'weight table label')
assert.ok(humanLine.includes('Сеть недоступна'), 'last_error in queue line')
assert.ok(humanLine.includes('скоро снимется'), 'drop warning at 10+ retries')

const networkQueueFix = resolveQuickFixes({
  errors: [],
  queue: [{ table_name: 'trainings', operation: 'insert', retry_count: 5, last_error: 'Failed to fetch' }],
  system: { online: true },
})
assert.ok(networkQueueFix.some((f) => f.id === 'queue-network'), 'queue network quick fix')

const report = buildDiagnosticReport({ system, errors, queue })
assert.ok(report.includes('=== Фитнес-дневник'))
assert.ok(report.includes('Очередь синхронизации'))
assert.ok(report.includes('Подсказка:'))

const fixes = resolveQuickFixes({
  errors: [{ source: 'sync', error: 'fail', status: 500 }],
  queue: [{ table_name: 'trainings', operation: 'insert' }],
  system: { online: true, errorCount: 1, queueCount: 1 },
})
assert.ok(fixes.some((f) => f.action === 'sync'))
assert.ok(fixes.some((f) => f.action === 'share'))

console.log('verify-app-diagnostics: OK')
