/**
 * node scripts/verify-deletion-audit.mjs
 */
import { buildDeletionAuditInsertRow, deletionActorRoleLabel } from '../src/lib/admin/deletionAuditCore.js'
import {
  formatDeletionAuditActor,
  formatDeletionAuditClient,
  formatDeletionAuditMeta,
} from '../src/lib/admin/deletionAuditFormatCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(buildDeletionAuditInsertRow({ entityTable: 'clients', entityId: '' }) === null, 'need id')
ok(buildDeletionAuditInsertRow({ entityTable: 'trainings', entityId: 'x' }) === null, 'only clients')

const row = buildDeletionAuditInsertRow({
  entityTable: 'clients',
  entityId: '11111111-1111-4111-8111-111111111111',
  clubId: 'c1',
  entityName: 'Карлова Ирина',
  entityCardNumber: '5263',
  deletedBy: 'u1',
  deletedByName: 'Роман',
  deletedByRole: 'trainer',
  source: 'push',
  meta: { trainings_count: 5 },
})
ok(row?.entity_name === 'Карлова Ирина' && row?.entity_card_number === '5263', 'snapshot fields')
ok(row?.source === 'push' && row?.meta?.trainings_count === 5, 'source and meta')
ok(deletionActorRoleLabel({ isTrainer: true }) === 'trainer', 'role trainer')
ok(deletionActorRoleLabel({ isAdmin: true }) === 'admin', 'role admin')
ok(formatDeletionAuditClient(row) === 'Карлова Ирина · № 5263', 'client label')
ok(formatDeletionAuditActor(row) === 'Роман (trainer)', 'actor label')
ok(formatDeletionAuditMeta({ trainings_count: 5, memberships_count: 1 }) === 'трен. 5 · абонов 1', 'meta')

if (failed) process.exit(1)
console.log('verify-deletion-audit: all ok')
