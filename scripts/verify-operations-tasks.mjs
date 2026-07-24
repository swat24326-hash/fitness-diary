/**
 * node scripts/verify-operations-tasks.mjs
 * Планёрка O1 — ручные задания и source_channel.
 */
import { buildDispatchFromInsightCard, formatDispatchForUi, normalizeDispatchCreatePayload } from '../src/lib/admin/iskraDispatchCore.js'
import {
  buildClientCardTaskDraft,
  buildDispatchFromProactiveAlert,
  buildManualTaskDraft,
  buildSalesReportTaskDraft,
  buildWeekChecklistTaskDraft,
  isManualStaffTaskChannel,
  normalizeStaffTaskContextJson,
  staffTaskSourceChannelLabel,
} from '../src/lib/admin/staffTaskCreateCore.js'
import { buildSalesReportDeepLink, resolveDispatchDeepLink } from '../src/lib/admin/staffTaskDeepLinkCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const manual = buildManualTaskDraft()
ok(manual.source === 'admin', 'manual draft source admin')
ok(manual.source_channel === 'manual_app', 'manual draft source_channel manual_app')
ok(manual.task_kind === 'custom', 'manual draft default task_kind')
ok(isManualStaffTaskChannel('manual_app'), 'is manual channel')
ok(!isManualStaffTaskChannel('iskra_insight_card'), 'insight card not manual')

const ctx = normalizeStaffTaskContextJson({
  client_id: 'c-1',
  note: 'x'.repeat(600),
  junk: null,
  nested: { a: 1 },
})
ok(ctx.client_id === 'c-1', 'context client_id')
ok(ctx.note.length === 500, 'context string capped')
ok(!('nested' in ctx), 'context skips nested objects')

const insight = buildDispatchFromInsightCard({
  id: 'inactive_clients',
  headline: 'Много неактивных',
  action: 'Связаться',
  evidence: '3 VIP',
  impactLabel: '≈ 24 000 ₽',
})
ok(insight.source_channel === 'iskra_insight_card', 'insight draft source_channel')

const manualPayload = normalizeDispatchCreatePayload({
  club_id: 'club-1',
  recipient_user_id: 'user-1',
  title: manual.title,
  body: manual.body,
  source: manual.source,
  source_channel: manual.source_channel,
  task_kind: manual.task_kind,
  due_preset: 'week',
})
ok(manualPayload.ok && manualPayload.payload.source_channel === 'manual_app', 'normalize manual payload')
ok(manualPayload.ok && manualPayload.payload.source === 'admin', 'normalize manual source')

const fallback = normalizeDispatchCreatePayload({
  club_id: 'club-1',
  recipient_user_id: 'user-1',
  title: 'Test',
  body: 'Body',
  source: 'admin',
})
ok(fallback.ok && fallback.payload.source_channel === 'manual_app', 'admin source defaults manual_app channel')

ok(staffTaskSourceChannelLabel('manual_app') === 'Вручную', 'channel label ru')
ok(staffTaskSourceChannelLabel('iskra_insight_card') === 'Карточка ИСКРЫ', 'insight channel label')

const clientDraft = buildClientCardTaskDraft({
  id: 'c1',
  name: 'Иванов И.И.',
  trainer_id: 't1',
  club_id: 'club-1',
})
ok(clientDraft.source_channel === 'client_card', 'client card draft channel')
ok(clientDraft.default_recipient_id === 't1', 'client card default trainer')
ok(clientDraft.deep_link === '/trainer/clients/c1', 'client card deep link')

const salesDraft = buildSalesReportTaskDraft({ clubId: 'club-1', reportDate: '2026-07-13' })
ok(salesDraft.source_channel === 'sales_report', 'sales report draft channel')
ok(salesDraft.task_kind === 'daily_report', 'sales report task kind')
ok(buildSalesReportDeepLink({ reportDate: '2026-07-13' }).includes('date=2026-07-13'), 'sales deep link date')

const weekDraft = buildWeekChecklistTaskDraft(
  { id: 'inactive_clients', label: 'Неактивные', detail: 'Связаться с 5 клиентами' },
  { clubId: 'club-1', year: 2026, month: 7 },
)
ok(weekDraft.source_channel === 'week_checklist', 'week checklist draft channel')

const alertDraft = buildDispatchFromProactiveAlert(
  {
    id: 'inactive_spike',
    title: 'Неактивных: 8',
    message: 'Риск оттока',
    severity: 'accent',
    handlerId: 'trainer_inactive',
  },
  { clubId: 'club-1', clubName: 'FIT-CITY', year: 2026, month: 7 },
)
ok(alertDraft.source_channel === 'iskra_proactive_alert', 'alert draft channel')
ok(alertDraft.task_kind === 'reactivate_clients', 'alert draft task kind')
ok(staffTaskSourceChannelLabel('iskra_proactive_alert') === 'Алерт ИСКРЫ', 'alert channel label')

ok(
  resolveDispatchDeepLink({
    task_kind: 'custom',
    context_json: { client_id: 'c9' },
  }) === '/trainer/clients/c9',
  'resolve deep link from client context',
)

const uiLink = formatDispatchForUi({
  id: 'd2',
  status: 'pending',
  task_kind: 'reactivate_clients',
  context_json: { client_id: 'c9' },
  title: 'Test',
  body: 'Body',
})
ok(uiLink.deep_link === '/trainer/clients/c9', 'formatDispatchForUi resolves deep link')

if (failed) process.exit(1)
console.log('verify-operations-tasks: all ok')
