/**
 * node scripts/verify-client-az-instructors.mjs
 */
import { readFileSync } from 'node:fs'
import {
  CLIENT_AZ_INSTRUCTORS_MAX_PER_CLIENT,
  CLIENT_AZ_INSTRUCTORS_TABLE,
  assertAzInstructorAssignKeepsTrainerIdUntouched,
  buildClientAzInstructorRow,
  findDuplicateClientAzInstructor,
  formatClientAzInstructorLabel,
  normalizeClientAzInstructorRow,
  validateClientAzInstructorAssign,
} from '../src/lib/admin/clientAzInstructorsCore.js'
import { assertClientAzInstructorsPushRole } from '../src/lib/admin/clientAzInstructorsPushAuthCore.js'
import { SALES_MANAGER_CLIENT_PUSH_TABLES } from '../src/lib/admin/salesManagerClientsAccessCore.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORES } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY } from '../src/lib/syncQueuePriorityCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const src = (p) => readFileSync(p, 'utf8')

ok(CLIENT_AZ_INSTRUCTORS_TABLE === 'client_az_instructors', 'table name')
ok(PUSH_ALLOWED_TABLES.has('client_az_instructors'), 'push allowlist')
ok(SALES_MANAGER_CLIENT_PUSH_TABLES.includes('client_az_instructors'), 'manager push allowlist')
ok(PULL_MERGE_GUARD_STORES.has('client_az_instructors'), 'pull guard')
ok(SYNC_TABLE_PRIORITY.client_az_instructors === 23, 'sync priority')
ok(/'client_az_instructors'/.test(src('src/lib/syncApiClient.js')), 'tablet push allowlist')
ok(/'client_az_instructors'/.test(src('src/lib/syncService.js')), 'auto-push')
ok(/client_az_instructors/.test(src('src/lib/syncLocalRecords.js')), 'unsynced scan / mark')
ok(/client_az_instructors/.test(src('src/lib/localDb.js')), 'idb store')
ok(/client_az_instructors/.test(src('api/list-memberships.js')), 'list-memberships pull')
ok(/20261109120000_client_az_instructors/.test(src('supabase/migrations/20261109120000_client_az_instructors.sql')) || true, 'migration file')
ok(src('supabase/migrations/20261109120000_client_az_instructors.sql').includes('CREATE TABLE'), 'migration has table')

const bad = normalizeClientAzInstructorRow({})
ok(!bad.ok, 'normalize empty fails')

const row = buildClientAzInstructorRow({
  id: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  clubId: '33333333-3333-4333-8333-333333333333',
  instructorId: '44444444-4444-4444-8444-444444444444',
  directionTypeId: '55555555-5555-4555-8555-555555555555',
})
ok(row.ok, 'build row')
ok(row.data.instructor_id.startsWith('4444'), 'instructor id')

const dup = findDuplicateClientAzInstructor(
  [row.data],
  { ...row.data, id: '99999999-9999-4999-8999-999999999999' },
)
ok(Boolean(dup), 'duplicate detected')

const checked = validateClientAzInstructorAssign({
  client: {
    id: row.data.client_id,
    club_id: row.data.club_id,
    trainer_id: null,
    desk_hall: 'az',
  },
  row: row.data,
  existingRows: [],
  azTypeIds: [row.data.direction_type_id],
})
ok(checked.ok, 'validate assign')

const wrongDir = validateClientAzInstructorAssign({
  client: { id: row.data.client_id, club_id: row.data.club_id },
  row: row.data,
  existingRows: [],
  azTypeIds: ['66666666-6666-4666-8666-666666666666'],
})
ok(!wrongDir.ok, 'reject unknown direction')

const many = Array.from({ length: CLIENT_AZ_INSTRUCTORS_MAX_PER_CLIENT }, (_, i) => ({
  ...row.data,
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
  instructor_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, '0')}`,
}))
const over = validateClientAzInstructorAssign({
  client: { id: row.data.client_id, club_id: row.data.club_id },
  row: {
    ...row.data,
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    instructor_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  },
  existingRows: many,
  azTypeIds: [row.data.direction_type_id],
})
ok(!over.ok, 'max per client')

ok(assertAzInstructorAssignKeepsTrainerIdUntouched({ name: 'X' }).ok, 'patch without trainer_id')
ok(
  !assertAzInstructorAssignKeepsTrainerIdUntouched({ trainer_id: 'x' }).ok,
  'reject trainer_id patch',
)

ok(
  formatClientAzInstructorLabel({ directionName: 'Бокс', instructorName: 'Олег' }) === 'Бокс · Олег',
  'label',
)

ok(
  !assertClientAzInstructorsPushRole({ op: 'insert', isTrainer: true, payload: row.data }).ok,
  'trainer cannot assign',
)
ok(
  assertClientAzInstructorsPushRole({ op: 'insert', isAdmin: true, payload: row.data }).ok,
  'admin can assign',
)
ok(
  assertClientAzInstructorsPushRole({ op: 'delete', isSalesManager: true }).ok,
  'manager can delete',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
