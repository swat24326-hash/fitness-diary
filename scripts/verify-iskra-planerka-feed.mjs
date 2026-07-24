/**
 * node scripts/verify-iskra-planerka-feed.mjs
 */
import {
  buildPlanerkaFeedItem,
  buildPlanerkaFeedPayload,
  buildPlanerkaFeedSummary,
} from '../src/lib/admin/iskraPlanerkaFeedCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const row = {
  id: 'd1',
  title: 'ИСКРА · Обзвонить неактивных',
  status: 'accepted',
  recipient_name: 'Иванов',
  due_label: 'до пятницы',
  is_overdue: false,
  source: 'iskra_insight',
  task_kind: 'reactivate_clients',
}

const item = buildPlanerkaFeedItem(row)
ok(item?.status_label === 'В работе', 'status label')
ok(item?.is_active === true, 'active flag')

const withReply = buildPlanerkaFeedItem({
  ...row,
  id: 'd-reply',
  status: 'done',
  recipient_reply: 'Созвонился, договорились на пятницу',
})
ok(withReply?.has_reply === true && withReply.recipient_reply.includes('Созвонился'), 'feed reply visible')

const overdueRow = { ...row, id: 'd2', status: 'pending', is_overdue: true, title: 'План ПЗ' }
const payload = buildPlanerkaFeedPayload([row, overdueRow, { ...row, id: 'd3', status: 'done' }])
ok(payload.items.length === 3, 'payload items')
ok(payload.items[0].is_overdue === true, 'overdue first')
ok(payload.summary.active_count === 2, 'active summary')

const summary = buildPlanerkaFeedSummary(payload.items)
ok(summary.overdue_count === 1, 'overdue count')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-iskra-planerka-feed: all checks passed')
