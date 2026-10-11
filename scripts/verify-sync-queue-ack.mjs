/**
 * node scripts/verify-sync-queue-ack.mjs
 * Снятие элемента очереди после push не теряет правку, влитую во время запроса (INC-2026-10-11-03).
 */
import { resolveQueueItemAfterPushAck } from '../src/lib/syncQueueAckCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const pushed = { id: 't1', updated_at: '2026-10-11T18:50:53.700Z', data: { training_focus: 'Сила' } }
const newer = { id: 't1', updated_at: '2026-10-11T18:50:53.763Z', data: { training_focus: 'Сила и выносливость' } }

ok(resolveQueueItemAfterPushAck({ local_id: 'q1', operation: 'update', remote_id: 't1', data: pushed }, pushed).action === 'delete', 'unchanged item → delete')
ok(resolveQueueItemAfterPushAck(null, pushed).action === 'delete', 'already removed → delete (no-op)')

const merged = resolveQueueItemAfterPushAck({ local_id: 'q1', operation: 'insert', remote_id: null, data: newer }, pushed)
ok(
  merged.action === 'as_update' && merged.remote_id === 't1',
  'CRITICAL: insert in flight + newer edit merged → keep as update (row already on server)',
)
ok(
  resolveQueueItemAfterPushAck({ local_id: 'q1', operation: 'update', remote_id: 't1', data: newer }, pushed).action === 'keep',
  'CRITICAL: update in flight + newer edit merged → keep for next push',
)
ok(
  resolveQueueItemAfterPushAck({ local_id: 'q1', operation: 'update', remote_id: 'c1', data: { id: 'c1', name: 'B' } }, { id: 'c1', name: 'A' }).action === 'delete',
  'table without updated_at → delete as before (no endless re-push)',
)
ok(
  resolveQueueItemAfterPushAck({ local_id: 'q1', operation: 'update', remote_id: 't1', data: pushed }, newer).action === 'delete',
  'queue older than pushed → delete',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-sync-queue-ack: all passed')
