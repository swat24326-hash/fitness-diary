/**
 * node scripts/verify-iskra-dispatch.mjs
 */
import {
  buildDispatchFromInsightCard,
  canAdminDeleteDispatch,
  canTransitionDispatchStatus,
  countActiveDispatch,
  formatDispatchForUi,
  normalizeDispatchCreatePayload,
  normalizeDispatchDeletePayload,
  normalizeRecipientUserIds,
} from '../src/lib/admin/iskraDispatchCore.js'
import {
  formatDispatchDueLabel,
  resolveDueAtFromPreset,
  resolveTaskKindFromInsight,
} from '../src/lib/admin/iskraTaskKindsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const card = {
  id: 'inactive_clients',
  headline: 'Много неактивных',
  action: 'Связаться с 5 клиентами из списка неактивных.',
  evidence: '3 VIP без тренировок 14+ дней',
  impactLabel: '≈ 24 000 ₽ в игре',
  tone: 'warn',
}

const draft = buildDispatchFromInsightCard(card, { clubName: 'FIT-CITY', periodLabel: 'июнь 2026' })
ok(draft.title.includes('Много неактивных'), 'draft title from insight')
ok(draft.task_kind === 'reactivate_clients', 'draft task_kind from insight')
ok(draft.deep_link.includes('filter=stale'), 'draft deep_link')

ok(resolveTaskKindFromInsight('report_today') === 'daily_report', 'insight → task kind')

const due = resolveDueAtFromPreset('tomorrow', new Date('2026-06-10T10:00:00Z'))
ok(due && due.includes('2026'), 'due preset tomorrow')

const good = normalizeDispatchCreatePayload({
  club_id: 'c1',
  recipient_user_id: 'u1',
  title: draft.title,
  body: draft.body,
  kind: 'task',
  source: 'iskra_insight',
  insight_key: draft.insight_key,
  due_preset: '3days',
  period_year: 2026,
  period_month: 6,
})
ok(good.ok && good.payload.due_at, 'normalize create with due_preset')

ok(canTransitionDispatchStatus('pending', 'seen'), 'pending→seen')
ok(canTransitionDispatchStatus('seen', 'accepted'), 'seen→accepted')
ok(canTransitionDispatchStatus('accepted', 'done'), 'accepted→done')
ok(!canTransitionDispatchStatus('done', 'pending'), 'done blocked')

const ui = formatDispatchForUi({
  id: 'd1',
  status: 'accepted',
  due_at: '2020-01-01T12:00:00Z',
  task_kind: 'reactivate_clients',
  priority: 'high',
  title: 'Test',
  body: 'Body',
  sender_name: 'ИСКРА',
})
ok(ui.is_overdue, 'overdue flag')
ok(formatDispatchDueLabel(ui.due_at), 'due label')

ok(countActiveDispatch([{ status: 'pending' }, { status: 'done' }, { status: 'accepted' }]) === 2, 'count active')

const multi = normalizeRecipientUserIds({
  recipient_user_ids: ['u1', 'u2', 'u1'],
})
ok(multi.ok && multi.ids.length === 2, 'recipient ids dedupe')

const batch = normalizeDispatchCreatePayload({
  club_id: 'c1',
  recipient_user_ids: ['u1', 'u2'],
  title: 'Test',
  body: 'Body',
})
ok(batch.ok && batch.payload.recipient_user_id === 'u1', 'batch uses first recipient in single payload')

const del = normalizeDispatchDeletePayload({ dispatch_id: 'd-1', club_id: 'c1' })
ok(del.ok && del.dispatch_id === 'd-1', 'normalize delete payload')
ok(canAdminDeleteDispatch('pending'), 'admin can delete pending')

if (failed) process.exit(1)
console.log('verify-iskra-dispatch: all ok')
