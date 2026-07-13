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
  buildDispatchTimeProgress,
  buildDispatchWorkflowProgress,
} from '../src/lib/admin/iskraDispatchProgressCore.js'
import {
  buildDispatchGlanceCaption,
  buildDispatchInboxActions,
  pickSpotlightDispatchTask,
  sortActiveDispatchTasks,
} from '../src/lib/admin/iskraDispatchInboxActionsCore.js'
import {
  formatDispatchDueLabel,
  resolveDueAtFromPreset,
  resolveTaskKindFromInsight,
} from '../src/lib/admin/iskraTaskKindsCore.js'
import {
  canCreateClubDispatch,
  canDeleteClubDispatch,
  canStopClubDispatchRecurrence,
  canViewClubDispatchSent,
  isDispatchRecipientRole,
} from '../src/lib/admin/iskraDispatchAccessCore.js'
import {
  buildRecurringDispatchSpawnRow,
  computeNextDueAtFromRecurrence,
  formatRecurrenceDaysRu,
  formatRecurrenceLabel,
  normalizeRecurrenceInput,
  normalizeStopRecurrencePayload,
  recurrenceRuleFromPreset,
} from '../src/lib/admin/iskraDispatchRecurrenceCore.js'
import {
  resolveDispatchDueAt,
  resolveDueAtFromMode,
  dueAtEndOfLocalDay,
} from '../src/lib/admin/iskraDispatchDueCore.js'
import {
  buildSelectedRecipientIds,
  dispatchRecipientSendLabel,
  toggleDispatchRecipientId,
} from '../src/lib/admin/iskraDispatchRecipientCore.js'
import {
  allDispatchStagesDone,
  buildDispatchStagesProgress,
  completeDispatchStage,
  normalizeDispatchStagesInput,
  parseDispatchStages,
  resetDispatchStagesForSpawn,
} from '../src/lib/admin/iskraDispatchStagesCore.js'

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

const wfSeen = buildDispatchWorkflowProgress('seen')
ok(wfSeen.pct === 33 && wfSeen.label === 'Просмотрено', 'workflow seen')

const time = buildDispatchTimeProgress(
  '2026-07-10T10:00:00Z',
  '2026-07-20T10:00:00Z',
  new Date('2026-07-15T10:00:00Z'),
)
ok(time.pct === 50 && time.tone === 'ok', 'time progress mid-window')

const overdue = buildDispatchTimeProgress(
  '2026-07-10T10:00:00Z',
  '2026-07-12T10:00:00Z',
  new Date('2026-07-15T10:00:00Z'),
)
ok(overdue.tone === 'overdue', 'time overdue')

const uiProgress = formatDispatchForUi({
  id: 'd3',
  status: 'seen',
  created_at: '2026-07-10T10:00:00Z',
  due_at: '2026-07-20T10:00:00Z',
  title: 'Test',
  body: 'Body',
})
ok(uiProgress.progress?.workflow?.label === 'Просмотрено', 'formatDispatchForUi progress workflow')
ok(uiProgress.progress?.time?.pct != null, 'formatDispatchForUi progress time')

const seenActions = buildDispatchInboxActions({ status: 'seen', deep_link: '/trainer/clients' })
ok(seenActions.primary?.action === 'accepted' && !seenActions.deepLink, 'seen step: accept only')

const acceptedActions = buildDispatchInboxActions({ status: 'accepted', deep_link: '/trainer/clients' })
ok(acceptedActions.primary?.action === 'done' && acceptedActions.deepLink, 'accepted step: done + link')

const stagesInput = normalizeDispatchStagesInput({ stages: ['Шаг 1', 'Шаг 2'] })
ok(stagesInput.length === 2 && stagesInput[0].id === 'st1' && !stagesInput[0].done, 'normalize stages input')

const stageDone = completeDispatchStage(stagesInput, 'st1')
ok(stageDone.ok && stageDone.stages[0].done && !stageDone.stages[1].done, 'complete one stage')

const allDone = completeDispatchStage(stageDone.stages, 'st2')
ok(allDispatchStagesDone(allDone.stages), 'all stages done')

const stagesProgress = buildDispatchStagesProgress(allDone.stages)
ok(stagesProgress?.label === 'Этапы: 2/2' && stagesProgress.tone === 'done', 'stages progress label')

const stagesBlocked = buildDispatchInboxActions({
  status: 'accepted',
  stages: [{ id: 'st1', title: 'A', done: true, order: 0 }, { id: 'st2', title: 'B', done: false, order: 1 }],
})
ok(stagesBlocked.stagesMode && !stagesBlocked.primary, 'accepted with open stages blocks done')

const stagesReady = buildDispatchInboxActions({
  status: 'accepted',
  stages: [{ id: 'st1', title: 'A', done: true, order: 0 }, { id: 'st2', title: 'B', done: true, order: 1 }],
})
ok(stagesReady.primary?.action === 'done' && stagesReady.primary?.label === 'Закрыть задание', 'all stages → close task')

const withStagesUi = formatDispatchForUi({
  id: 'd-st',
  status: 'accepted',
  created_at: '2026-07-10T10:00:00Z',
  title: 'T',
  body: 'B',
  stages_json: stagesInput,
})
ok(withStagesUi.stages_label === 'Этапы: 0/2', 'formatDispatchForUi stages label')
ok(withStagesUi.progress?.stages?.total === 2, 'formatDispatchForUi stages progress')

const resetStages = resetDispatchStagesForSpawn(
  parseDispatchStages([{ id: 'st1', title: 'A', done: true, done_at: '2026-07-10T10:00:00Z', order: 0 }]),
)
ok(resetStages[0].done === false && resetStages[0].done_at === null, 'reset stages for spawn')

const picked = pickSpotlightDispatchTask([
  { status: 'accepted', priority: 'normal', due_at: '2026-08-01T12:00:00Z' },
  { status: 'pending', priority: 'high', due_at: '2026-07-14T12:00:00Z', is_overdue: false },
])
ok(picked.spotlight?.status === 'pending' && picked.moreCount === 1, 'spotlight prefers pending/high')

ok(sortActiveDispatchTasks([{ status: 'accepted' }, { status: 'pending' }])[0]?.status === 'pending', 'sort active tasks')

const glance = buildDispatchGlanceCaption(
  formatDispatchForUi({
    id: 'd4',
    status: 'seen',
    created_at: '2026-07-10T10:00:00Z',
    due_at: '2026-07-20T10:00:00Z',
    title: 'Test',
    body: 'Body',
  }),
)
ok(glance.includes('Просмотрено'), 'glance caption')

ok(isDispatchRecipientRole('trainer'), 'trainer is dispatch recipient')
ok(isDispatchRecipientRole('sales_manager'), 'sales manager is dispatch recipient')
ok(!isDispatchRecipientRole('admin'), 'admin not dispatch recipient')

ok(canCreateClubDispatch({ isAdmin: true }, 'c1'), 'admin can create dispatch')
ok(canCreateClubDispatch({ isSalesManager: true, user: { club_id: 'c1' } }, 'c1'), 'manager own club')
ok(!canCreateClubDispatch({ isSalesManager: true, user: { club_id: 'c1' } }, 'c2'), 'manager other club blocked')
ok(canViewClubDispatchSent({ isSalesManager: true }), 'manager can view sent')
ok(!canDeleteClubDispatch({ isSalesManager: true }), 'manager cannot delete')
ok(canStopClubDispatchRecurrence({ isAdmin: true }, 'c1'), 'admin can stop recurrence')
ok(canStopClubDispatchRecurrence({ isSalesManager: true, user: { club_id: 'c1' } }, 'c1'), 'manager stop own club')

const customRecur = normalizeRecurrenceInput({ recurrence_preset: 'custom_days', recurrence_days: 5 })
ok(customRecur.enabled && customRecur.interval === 5, 'custom 5 days recurrence')

const badCustom = normalizeDispatchCreatePayload({
  club_id: 'c1',
  recipient_user_id: 'u1',
  title: 'T',
  body: 'B',
  due_preset: 'tomorrow',
  recurrence_preset: 'custom_days',
  recurrence_days: 1,
})
ok(!badCustom.ok, 'custom 1 day blocked')

ok(formatRecurrenceDaysRu(5) === '5 дней', 'days label ru 5')
ok(formatRecurrenceLabel(5, 'day') === 'Каждые 5 дней', 'label every 5 days')

const stopPayload = normalizeStopRecurrencePayload({ dispatch_id: 'd1', club_id: 'c1' })
ok(stopPayload.ok && stopPayload.dispatch_id === 'd1', 'stop recurrence payload')

const toggled = toggleDispatchRecipientId(['u1'], 'u2')
ok(toggled.length === 2 && toggled.includes('u2'), 'toggle adds recipient')
const toggledOff = toggleDispatchRecipientId(toggled, 'u1')
ok(toggledOff.length === 1 && toggledOff[0] === 'u2', 'toggle removes recipient')

const severalIds = buildSelectedRecipientIds('several', {
  multiIds: ['a', 'b'],
  options: [{ trainer_id: 'a' }, { trainer_id: 'b' }, { trainer_id: 'c' }],
})
ok(severalIds.length === 2, 'several mode ids')

ok(dispatchRecipientSendLabel('all', 0, 5) === 'Поставить всем (5)', 'send label all')
ok(dispatchRecipientSendLabel('several', 3, 5) === 'Поставить (3)', 'send label several')

const dueDate = resolveDispatchDueAt({ due_preset: 'date', due_date: '2026-08-01' })
ok(dueDate.due_at && dueDate.due_mode === 'date', 'due from calendar date')

const dueTomorrow = resolveDueAtFromMode('tomorrow', { now: new Date('2026-07-10T10:00:00Z') })
ok(dueTomorrow && dueTomorrow.includes('2026'), 'due mode tomorrow')

const recur = recurrenceRuleFromPreset('every_3_weeks')
ok(recur.enabled && recur.interval === 3 && recur.unit === 'week', 'recurrence every 3 weeks')

const nextDue = computeNextDueAtFromRecurrence(
  '2026-07-10T20:59:59.999Z',
  { interval: 1, unit: 'week' },
  new Date('2026-07-11T10:00:00Z'),
)
ok(nextDue && nextDue > '2026-07-10', 'next due after week')

const badRecur = normalizeDispatchCreatePayload({
  club_id: 'c1',
  recipient_user_id: 'u1',
  title: 'T',
  body: 'B',
  due_preset: 'none',
  recurrence_preset: 'daily',
})
ok(!badRecur.ok, 'recurring without due blocked')

const spawn = buildRecurringDispatchSpawnRow(
  {
    club_id: 'c1',
    recipient_user_id: 'u1',
    series_id: 's1',
    recurrence_interval: 1,
    recurrence_unit: 'day',
    title: 'T',
    body: 'B',
    kind: 'task',
    source: 'admin',
    task_kind: 'custom',
    priority: 'normal',
    due_at: '2026-07-10T20:59:59.999Z',
  },
  '2026-07-11T20:59:59.999Z',
  '2026-07-11T12:00:00Z',
)
ok(spawn.series_id === 's1' && spawn.status === 'pending', 'spawn row keeps series')

ok(formatRecurrenceLabel(1, 'month') === 'Каждый месяц', 'recurrence label monthly')
ok(dueAtEndOfLocalDay('2026-07-15'), 'due end of local day')

if (failed) process.exit(1)
console.log('verify-iskra-dispatch: all ok')
