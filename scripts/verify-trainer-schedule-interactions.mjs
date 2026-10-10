/**
 * Ежедневник: линия «сейчас», повтор записи, перенос долгим нажатием, категории записей — чистые правила.
 * node scripts/verify-trainer-schedule-interactions.mjs
 */
import {
  minutesOfDayInTimeZone,
  resolveScheduleInitialScrollMinutes,
  resolveScheduleNowLineMinutes,
  scheduleRangeIncludesToday,
} from '../src/lib/trainer/trainerScheduleNowCore.js'
import {
  SCHEDULE_REPEAT_MAX_WEEKS,
  buildScheduleRepeatDays,
  hasScheduleDuplicateOnDay,
  normalizeScheduleRepeatWeekdays,
  planScheduleRepeatCopies,
  scheduleWeekdayIndex,
} from '../src/lib/trainer/trainerScheduleRecurrenceCore.js'
import {
  SCHEDULE_DRAG_FREE,
  SCHEDULE_DRAG_LOCKED,
  SCHEDULE_DRAG_SAME_DAY,
  isScheduleMoveNoop,
  resolveScheduleAutoScrollDelta,
  resolveScheduleDragDayIndex,
  resolveScheduleDragPolicy,
  resolveScheduleDragStartMinutes,
  snapScheduleMinutes,
} from '../src/lib/trainer/trainerScheduleDragCore.js'
import {
  SCHEDULE_KINDS,
  coerceScheduleKindForEntry,
  normalizeScheduleKind,
  resolveScheduleEntryKind,
  resolveScheduleEntryState,
  scheduleKindFormMode,
} from '../src/lib/trainer/trainerScheduleKindCore.js'
import { normalizeTrainerSchedulePushPayload } from '../src/lib/trainer/trainerSchedulePushPayload.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

/* --- Сейчас --- */
ok(minutesOfDayInTimeZone(new Date('2026-10-10T21:49:00Z')) === 49, 'now: 21:49 UTC = 00:49 МСК')
ok(minutesOfDayInTimeZone(new Date('2026-10-11T07:30:00Z')) === 630, 'now: 07:30 UTC = 10:30 МСК')
ok(resolveScheduleNowLineMinutes('2026-10-11', '2026-10-11', 630) === 630, 'now line: today')
ok(resolveScheduleNowLineMinutes('2026-10-12', '2026-10-11', 630) === null, 'now line: not today')
ok(resolveScheduleNowLineMinutes('2026-10-11', '2026-10-11', NaN) === null, 'now line: bad minutes')
ok(resolveScheduleInitialScrollMinutes(['2026-10-11'], '2026-10-11', 630) === 570, 'scroll: today → now − 1 h')
ok(resolveScheduleInitialScrollMinutes(['2026-10-11'], '2026-10-11', 20) === 0, 'scroll: early night clamps 0')
ok(resolveScheduleInitialScrollMinutes(['2026-10-12'], '2026-10-11', 630) === 420, 'scroll: other day → 07:00')
ok(scheduleRangeIncludesToday(['2026-10-10', '2026-10-11'], '2026-10-11'), 'range includes today')
ok(!scheduleRangeIncludesToday(['2026-10-12'], '2026-10-11'), 'range without today')

/* --- Повтор --- */
ok(scheduleWeekdayIndex('2026-10-12') === 0 && scheduleWeekdayIndex('2026-10-11') === 6, 'weekday Mon=0, Sun=6')
ok(normalizeScheduleRepeatWeekdays([3, 0, 3, 9, 'x']).join(',') === '0,3', 'weekdays normalize')
{
  const days = buildScheduleRepeatDays({ startDayIso: '2026-10-12', weekdays: [0], weeks: 4 })
  ok(days.join(',') === '2026-10-19,2026-10-26,2026-11-02', 'repeat Mon ×4 weeks = 3 copies (first is original)')
}
{
  const days = buildScheduleRepeatDays({ startDayIso: '2026-10-12', weekdays: [0, 3], weeks: 2 })
  ok(days.join(',') === '2026-10-15,2026-10-19,2026-10-22', 'repeat Mon+Thu ×2 weeks')
}
{
  const days = buildScheduleRepeatDays({ startDayIso: '2026-10-05', weekdays: [0], weeks: 4, todayIso: '2026-10-20' })
  ok(days.join(',') === '2026-10-26', 'repeat skips days before today')
}
ok(
  buildScheduleRepeatDays({ startDayIso: '2026-10-12', weekdays: [0], weeks: 99 }).length === SCHEDULE_REPEAT_MAX_WEEKS - 1,
  'repeat capped by max weeks',
)
ok(buildScheduleRepeatDays({ startDayIso: '2026-10-12', weekdays: [], weeks: 4 }).length === 0, 'repeat: no weekdays')
ok(buildScheduleRepeatDays({ startDayIso: 'bad', weekdays: [0], weeks: 4 }).length === 0, 'repeat: bad start')
{
  const existing = [
    { day_date: '2026-10-19', start_minutes: 600, client_ids: ['b', 'a'], title: '' },
    { day_date: '2026-10-26', start_minutes: 660, client_ids: ['a', 'b'], title: '' },
    { day_date: '2026-11-02', start_minutes: 600, client_ids: [], title: 'Обед' },
  ]
  const base = { start_minutes: 600, client_ids: ['a', 'b'], title: '' }
  ok(hasScheduleDuplicateOnDay(existing, base, '2026-10-19'), 'dup: same clients any order')
  ok(!hasScheduleDuplicateOnDay(existing, base, '2026-10-26'), 'dup: other time is not dup')
  ok(!hasScheduleDuplicateOnDay(existing, base, '2026-11-02'), 'dup: note vs clients is not dup')
  ok(
    hasScheduleDuplicateOnDay(existing, { start_minutes: 600, client_ids: [], title: 'Обед' }, '2026-11-02'),
    'dup: same note',
  )
  const plan = planScheduleRepeatCopies({ startDayIso: '2026-10-12', weekdays: [0], weeks: 4 }, base, existing)
  ok(plan.days.join(',') === '2026-10-26,2026-11-02' && plan.skipped === 1, 'plan: skip duplicate day')
}

/* --- Перенос --- */
ok(resolveScheduleDragPolicy({ linked_training_id: null }, null) === SCHEDULE_DRAG_FREE, 'drag: no training → free')
ok(
  resolveScheduleDragPolicy({ linked_training_id: 't1' }, { id: 't1', status: 'draft' }) === SCHEDULE_DRAG_SAME_DAY,
  'drag: draft → same day only',
)
ok(
  resolveScheduleDragPolicy({ linked_training_id: 't1' }, null) === SCHEDULE_DRAG_SAME_DAY,
  'drag: training not loaded → same day only',
)
ok(
  resolveScheduleDragPolicy({ linked_training_id: 't1' }, { id: 't1', status: 'completed' }) === SCHEDULE_DRAG_LOCKED,
  'drag: completed → locked',
)
ok(snapScheduleMinutes(607) === 600 && snapScheduleMinutes(608) === 615, 'snap 15 min')
ok(snapScheduleMinutes(-40) === 0, 'snap clamps at 00:00')
ok(snapScheduleMinutes(1500) === 1425, 'snap clamps at 23:45')
ok(
  resolveScheduleDragStartMinutes({ pointerY: 1000, grabOffsetY: 20, trackTop: 140, pxPerMin: 1.4 }) === 600,
  'drag start from pointer: (1000−20−140)/1.4 = 600 → 10:00',
)
{
  const rects = [
    { left: 60, right: 160 },
    { left: 168, right: 268 },
    { left: 276, right: 376 },
  ]
  ok(resolveScheduleDragDayIndex(rects, 200, 0, SCHEDULE_DRAG_FREE) === 1, 'day index: middle column')
  ok(resolveScheduleDragDayIndex(rects, 163, 2, SCHEDULE_DRAG_FREE) === 0, 'day index: gap → nearest half')
  ok(resolveScheduleDragDayIndex(rects, 10, 1, SCHEDULE_DRAG_FREE) === 0, 'day index: left of grid → first')
  ok(resolveScheduleDragDayIndex(rects, 900, 0, SCHEDULE_DRAG_FREE) === 2, 'day index: right of grid → last')
  ok(resolveScheduleDragDayIndex(rects, 300, 0, SCHEDULE_DRAG_SAME_DAY) === 0, 'day index: same-day policy stays')
}
ok(resolveScheduleAutoScrollDelta(110, 100, 600) < 0, 'autoscroll up near top')
ok(resolveScheduleAutoScrollDelta(590, 100, 600) > 0, 'autoscroll down near bottom')
ok(resolveScheduleAutoScrollDelta(350, 100, 600) === 0, 'autoscroll none in middle')
ok(isScheduleMoveNoop({ day_date: '2026-10-12', start_minutes: 600 }, '2026-10-12', 600), 'noop: same place')
ok(!isScheduleMoveNoop({ day_date: '2026-10-12', start_minutes: 600 }, '2026-10-13', 600), 'not noop: other day')

/* --- Категории --- */
ok(SCHEDULE_KINDS.length === 5, 'kinds: 5 categories')
ok(normalizeScheduleKind(' group ') === 'group', 'kind: trims valid')
ok(normalizeScheduleKind('party') === null, 'kind: unknown → null')
ok(coerceScheduleKindForEntry('work', ['c1']) === null, 'kind: work with clients → null')
ok(coerceScheduleKindForEntry('personal', ['c1']) === null, 'kind: personal with clients → null')
ok(coerceScheduleKindForEntry('training', []) === null, 'kind: training without clients → null')
ok(coerceScheduleKindForEntry('group', []) === 'group', 'kind: group as note ok')
ok(coerceScheduleKindForEntry('trial', ['c1']) === 'trial', 'kind: trial with client ok')
ok(resolveScheduleEntryKind({ client_ids: ['c1'] }) === 'training', 'kind default: clients → training')
ok(resolveScheduleEntryKind({ client_ids: [], title: 'Обед' }) === 'personal', 'kind default: note → personal')
ok(resolveScheduleEntryKind({ kind: 'work', client_ids: [] }) === 'work', 'kind: stored work shown')
ok(resolveScheduleEntryKind({ kind: 'work', client_ids: ['c1'] }) === 'training', 'kind: contradictory stored → default')
ok(scheduleKindFormMode('training') === 'clients', 'form: training → clients')
ok(scheduleKindFormMode('personal') === 'note', 'form: personal → note')
ok(scheduleKindFormMode('group') === 'either', 'form: group → either')
{
  const now = { todayIso: '2026-10-11', nowMinutes: 12 * 60 }
  const e = { day_date: '2026-10-11', start_minutes: 10 * 60, duration_minutes: 60 }
  ok(resolveScheduleEntryState(e, null, now).past, 'state: ended earlier today → past')
  ok(!resolveScheduleEntryState({ ...e, start_minutes: 11 * 60 + 30 }, null, now).past, 'state: in progress → not past')
  ok(!resolveScheduleEntryState({ ...e, day_date: '2026-10-12' }, null, now).past, 'state: tomorrow → not past')
  ok(resolveScheduleEntryState(e, { status: 'draft' }, now).draft, 'state: draft training')
  ok(resolveScheduleEntryState(e, { status: 'completed' }, now).done, 'state: completed training')
}
{
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    club_id: '22222222-2222-4222-8222-222222222222',
    trainer_id: '33333333-3333-4333-8333-333333333333',
    day_date: '2026-10-12',
    start_minutes: 600,
    duration_minutes: 60,
    title: '',
    client_ids: ['c1'],
  }
  const legacy = normalizeTrainerSchedulePushPayload(base)
  ok(legacy && !('kind' in legacy), 'push: old bundle without kind → column untouched')
  ok(normalizeTrainerSchedulePushPayload({ ...base, kind: 'group' })?.kind === 'group', 'push: kind passes')
  ok(normalizeTrainerSchedulePushPayload({ ...base, kind: 'work' })?.kind === null, 'push: work with clients → null')
  ok(normalizeTrainerSchedulePushPayload({ ...base, kind: 'hack' })?.kind === null, 'push: unknown kind → null')
  ok(normalizeTrainerSchedulePushPayload({ ...base, kind: null })?.kind === null, 'push: explicit null resets')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-trainer-schedule-interactions: all passed')
