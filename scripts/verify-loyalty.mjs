/**
 * node scripts/verify-loyalty.mjs
 * Лояльность ПЗ: eligible, недели, ккал, цикл, куш, пропуск. Кейсы = docs/LOYALTY.md §14.
 */
import { addMonthsToIso } from '../src/lib/dateRu.js'
import { estimateKcalKeytel, HR_SAMPLE_INTERVAL_MS } from '../src/lib/hr/hrSessionAgg.js'
import { assertRedeemAllowed, buildLoyaltyAccount } from '../src/lib/loyalty/loyaltyAccountCore.js'
import { applyProgramToggle, isDateEnabled, weekFullyEnabled } from '../src/lib/loyalty/loyaltyEnabledCore.js'
import { computeLoyaltyKcal } from '../src/lib/loyalty/loyaltyKcalCore.js'
import { normalizeLoyaltySettings } from '../src/lib/loyalty/loyaltySettingsCore.js'
import { isLoyaltyEligibleTraining } from '../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import { addDaysIso, mondayOf, sundayOf } from '../src/lib/loyalty/loyaltyWeekCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const CLIENT = 'c1'
const CLUB = 'club1'
const TYPE_PZ = { id: 'tpz', code: 'ПЗ', is_pnk_trial: false }
const TYPE_BZ = { id: 'tbz', code: 'БЗ', is_pnk_trial: true }
const MEM_PZ = {
  id: 'm-pz',
  hall: 'pz',
  membership_type_id: 'tpz',
  start_date: '2026-01-01',
  end_date: '2029-12-31',
  total_trainings: 200,
  used_trainings: 0,
}
const MEM_BZ = {
  id: 'm-bz',
  hall: 'pz',
  membership_type_id: 'tbz',
  start_date: '2026-01-01',
  end_date: '2029-12-31',
  total_trainings: 10,
  used_trainings: 0,
}
const MEM_TZ = {
  id: 'm-tz',
  hall: 'tz',
  membership_type_id: 'tpz',
  start_date: '2026-01-01',
  end_date: '2029-12-31',
  total_trainings: 200,
  used_trainings: 0,
}

const INTERVALS_OPEN = [{ start: '2026-01-01', end: null }]

function settings(patch = {}) {
  return normalizeLoyaltySettings({
    enabled: true,
    enabled_at: '2026-01-01',
    enabled_intervals: INTERVALS_OPEN,
    cycle_months: 3,
    points_per_week: 50,
    kcal_chunk: 100,
    points_per_kcal_chunk: 5,
    ...patch,
  })
}

function tr(patch) {
  return {
    id: patch.id ?? `t-${patch.date}`,
    client_id: CLIENT,
    club_id: CLUB,
    date: patch.date,
    status: patch.status ?? 'completed',
    type: patch.type ?? 'Силовая',
    data: {
      membership_id: patch.membership_id ?? 'm-pz',
      ...patch.data,
    },
  }
}

const eligCtx = {
  as_of: '2026-12-31',
  client_id: CLIENT,
  club_id: CLUB,
  memberships: [MEM_PZ, MEM_BZ, MEM_TZ],
  types: [TYPE_PZ, TYPE_BZ],
  intervals: INTERVALS_OPEN,
}

function account(patch) {
  return buildLoyaltyAccount({
    as_of: patch.as_of,
    client_id: CLIENT,
    club_id: CLUB,
    archived_at: patch.archived_at ?? null,
    settings: settings(patch.settings),
    trainings: patch.trainings ?? [],
    memberships: [MEM_PZ, MEM_BZ, MEM_TZ],
    membership_types: [TYPE_PZ, TYPE_BZ],
    ledger: patch.ledger ?? [],
  })
}

function weeklyFrom(start, asOf) {
  const out = []
  let d = start
  let i = 0
  while (d && d <= asOf) {
    out.push(tr({ id: `w-${i}`, date: d }))
    d = addDaysIso(d, 7)
    i += 1
    if (i > 80) break
  }
  return out
}

const HEALTH = { birthDate: '1990-01-15', sex: 'male', weightKg: 80, asOfIso: '2026-09-03' }

ok(mondayOf('2026-09-03') === '2026-08-31', 'monday of Thu Sep 3')
ok(sundayOf('2026-09-03') === '2026-09-06', 'sunday of that week')

ok(!isLoyaltyEligibleTraining(tr({ date: '2026-09-03', membership_id: 'm-bz' }), eligCtx), '1 БЗ не eligible')
ok(isLoyaltyEligibleTraining(tr({ date: '2026-09-03' }), eligCtx), '2 ПЗ completed eligible')
ok(
  !isLoyaltyEligibleTraining(
    tr({
      date: '2026-09-03',
      data: { membership_id: 'm-pz', is_writeoff: true, training_focus: 'Списание (неявка)' },
    }),
    eligCtx,
  ),
  '3 is_writeoff Силовая не визит',
)
ok(
  !isLoyaltyEligibleTraining(
    tr({
      date: '2026-09-03',
      data: { membership_id: 'm-pz', training_focus: 'Списание (неявка)' },
    }),
    eligCtx,
  ),
  '3b focus Списание (неявка) без is_writeoff',
)
ok(!isLoyaltyEligibleTraining(tr({ date: '2026-09-03', type: 'Списание' }), eligCtx), '4 type Списание не визит')
ok(
  !isLoyaltyEligibleTraining(tr({ date: '2026-09-03', membership_id: 'm-tz' }), eligCtx),
  '4b ТЗ hall не eligible',
)

{
  const a = account({
    as_of: '2026-09-04',
    trainings: [tr({ id: 'a', date: '2026-09-03' }), tr({ id: 'b', date: '2026-09-03' })],
  })
  ok(a.weeks_credited === 1 && a.points === 50, '5 две в один день — 1 неделя')
}

{
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']
  const a = account({
    as_of: '2026-09-05',
    trainings: dates.map((d, i) => tr({ id: `n${i}`, date: d })),
  })
  ok(a.weeks_credited === 1 && a.points === 50, '6 пять в неделю — 1 пачка')
}

ok(addMonthsToIso('2026-09-03', 3) === '2026-12-03', '7a addMonths Sep3+3')
{
  const asOf = '2026-12-03'
  const a = account({ as_of: asOf, trainings: weeklyFrom('2026-09-03', asOf) })
  ok(a.state === 'active' && a.unlock_on === '2026-12-03' && a.can_redeem === true, '7b can_redeem в день куша')
}

ok(addMonthsToIso('2026-01-31', 3) === '2026-04-30', '8 addMonths Jan31+3 → Apr 30')

{
  const a = account({ as_of: '2026-09-14', trainings: [tr({ date: '2026-09-03' })] })
  ok(a.state === 'idle' && a.points === 0 && a.cycle_start == null, '9 пустая законченная неделя → idle')
}

{
  const a = account({ as_of: '2026-09-10', trainings: [tr({ date: '2026-09-03' })] })
  ok(a.state === 'active' && a.missed_open_week === true && a.points === 50, '10 текущая неделя пустая — ещё active')
}

{
  const a = account({
    as_of: '2026-09-03',
    trainings: [tr({ date: '2026-09-03', data: { membership_id: 'm-pz', loyalty: { kcal: 250 } } })],
  })
  ok(a.kcal_remainder === 50 && a.points === 50 + 10, '11 250 ккал → +10 и remainder 50')
}

{
  const redeemAt = '2026-09-09T15:00:00.000Z'
  const morning = tr({
    id: 'morn',
    date: '2026-09-09',
    data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-09T08:00:00.000Z', kcal: 100 } },
  })
  const evening = tr({
    id: 'eve',
    date: '2026-09-09',
    data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-09T18:00:00.000Z', kcal: 100 } },
  })
  const a = account({
    as_of: '2026-09-09',
    trainings: [morning, evening],
    ledger: [{ kind: 'redeem', at: redeemAt, snapshot: settings(), points: 10 }],
  })
  ok(
    a.state === 'active' && a.cycle_start === '2026-09-09' && a.weeks_credited === 1 && a.points === 50 + 5,
    '12 утро до redeem не в цикле, вечер после — в цикле',
  )
}

ok(
  !isLoyaltyEligibleTraining(tr({ date: '2025-12-01' }), { ...eligCtx, intervals: [{ start: '2026-01-01', end: null }] }),
  '13 тренировка до enabled_at не eligible',
)

{
  const start = Date.parse('2026-09-03T10:00:00.000Z')
  const inWin = { t: start + 10 * 60 * 1000, bpm: 140 }
  const outWin = { t: start + 90 * 60 * 1000, bpm: 180 }
  const kcalIn = computeLoyaltyKcal({
    samples: [inWin],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  const kcalBoth = computeLoyaltyKcal({
    samples: [inWin, outWin],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  ok(kcalIn > 0 && kcalIn === kcalBoth, '14 сэмпл вне окна не входит')
  const capped = computeLoyaltyKcal({
    samples: [inWin, { t: start + 20 * 60 * 1000, bpm: 190 }],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 1,
  })
  ok(capped <= 1, '14b cap maxKcal')
}

{
  const a = account({
    as_of: '2026-09-03',
    trainings: [tr({ date: '2026-09-03' })],
  })
  ok(a.points === 50 && a.kcal_remainder === 0, '15 нет loyalty.kcal — 0 ккал, неделя жива')
}

ok(
  !isLoyaltyEligibleTraining(tr({ date: '2026-09-01' }), {
    ...eligCtx,
    club_moved_on: '2026-09-03',
    club_moved_at: '2026-09-03T12:00:00.000Z',
  }),
  '16a date < club_moved_on',
)
ok(
  !isLoyaltyEligibleTraining(
    tr({
      date: '2026-09-03',
      data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-03T08:00:00.000Z' } },
    }),
    { ...eligCtx, club_moved_on: '2026-09-03', club_moved_at: '2026-09-03T12:00:00.000Z' },
  ),
  '16b тот же день completed_at < move.at',
)
ok(
  !isLoyaltyEligibleTraining(
    tr({ date: '2026-09-03' }),
    { ...eligCtx, club_moved_on: '2026-09-03', club_moved_at: '2026-09-03T12:00:00.000Z' },
  ),
  '16c день переезда без completed_at — нет',
)
ok(
  isLoyaltyEligibleTraining(
    tr({
      date: '2026-09-03',
      data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-03T15:00:00.000Z' } },
    }),
    { ...eligCtx, club_moved_on: '2026-09-03', club_moved_at: '2026-09-03T12:00:00.000Z' },
  ),
  '16d после переезда eligible',
)

{
  const start = Date.parse('2026-09-03T10:00:00.000Z')
  const five = computeLoyaltyKcal({
    samples: [
      { t: start, bpm: 150 },
      { t: start + 5 * 60 * 1000, bpm: 150 },
    ],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  const hour = computeLoyaltyKcal({
    samples: [
      { t: start, bpm: 150 },
      { t: start + 60 * 60 * 1000, bpm: 150 },
    ],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  const expectFive = estimateKcalKeytel({
    avgBpm: 150,
    weightKg: 80,
    ageYears: 36,
    sex: 'male',
    durationMin: 5,
  })
  ok(five === expectFive && five < hour, '17 два сэмпла 5 мин ≠ 60 мин')
}

ok(!isLoyaltyEligibleTraining(tr({ date: '2026-09-04' }), { ...eligCtx, as_of: '2026-09-03' }), '18 date > as_of')

{
  const iv = applyProgramToggle([{ start: '2026-01-01', end: null }], { enabled: false, as_of: '2026-09-09' })
  ok(isDateEnabled('2026-09-09', iv), '19a §7 день выключения ещё вкл')
  ok(!isDateEnabled('2026-09-10', iv), '19b следующий день выкл')
  ok(isLoyaltyEligibleTraining(tr({ date: '2026-09-09' }), { ...eligCtx, intervals: iv }), '19c тренировка ср eligible')
  ok(!isLoyaltyEligibleTraining(tr({ date: '2026-09-10' }), { ...eligCtx, intervals: iv }), '19d тренировка чт не eligible')
  ok(!weekFullyEnabled(mondayOf('2026-09-09'), iv), '19e неделя не fully enabled')
  const a = account({
    as_of: '2026-09-15',
    settings: { enabled: true, enabled_at: '2026-01-01', enabled_intervals: iv },
    trainings: [tr({ date: '2026-09-03' })],
  })
  ok(
    a.state === 'active' && a.cycle_start === '2026-09-03' && a.points === 50,
    '19f смешанная законченная неделя не burn',
  )
}

{
  const a = account({
    as_of: '2026-12-03',
    trainings: weeklyFrom('2026-09-03', '2026-12-03'),
    settings: { points_per_week: 80 },
    ledger: [
      {
        kind: 'cycle_open',
        at: '2026-09-03T10:00:00.000Z',
        payload: { cycle_start: '2026-09-03' },
        snapshot: { cycle_months: 3, points_per_week: 50, kcal_chunk: 100, points_per_kcal_chunk: 5 },
      },
    ],
  })
  ok(a.weeks_credited > 0 && a.points === a.weeks_credited * 50, '20 снимок 50, settings 80 — открытый цикл 50')
}

{
  const filled = account({
    as_of: '2026-09-21',
    trainings: [tr({ id: 'first', date: '2026-09-03' }), tr({ id: 'hole', date: '2026-09-10' }), tr({ id: 'later', date: '2026-09-17' })],
  })
  const hole = account({
    as_of: '2026-09-21',
    trainings: [tr({ id: 'first', date: '2026-09-03' }), tr({ id: 'later', date: '2026-09-17' })],
  })
  ok(filled.cycle_start === '2026-09-03' && filled.state === 'active', '21a дырка заполнена датой недели — тот же cycle_start')
  ok(hole.cycle_start === '2026-09-17' && hole.state === 'active', '21b без заполнения — miss_restart на дату после дырки')
}

{
  const redeemAt = '2026-09-09T12:00:00.000Z'
  const later = tr({
    id: 'later',
    date: '2026-09-16',
    data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-16T10:00:00.000Z' } },
  })
  const a = account({
    as_of: '2026-09-21',
    trainings: [later],
    ledger: [{ kind: 'redeem', at: redeemAt, snapshot: settings(), points: 10 }],
  })
  ok(a.state === 'active' && a.cycle_start === '2026-09-16', '22 redeem + дырка без заполнения — cycle_start не дата redeem')
}

{
  const fill = tr({
    id: 'fill',
    date: '2026-09-10',
    data: { membership_id: 'm-pz', loyalty: { completed_at: '2026-09-10T10:00:00.000Z' } },
  })
  const a = account({
    as_of: '2026-09-14',
    trainings: [fill],
    ledger: [{ kind: 'redeem', at: '2026-09-09T12:00:00.000Z', snapshot: settings(), points: 10 }],
  })
  ok(a.state === 'active' && a.cycle_start === '2026-09-09', '22b неделя redeem заполнена — cycle_start остаётся датой куша')
}

{
  const two = account({
    as_of: '2026-09-10',
    trainings: [tr({ id: 'first', date: '2026-09-03' }), tr({ id: 'second', date: '2026-09-10' })],
  })
  const one = account({
    as_of: '2026-09-10',
    trainings: [tr({ id: 'second', date: '2026-09-10' })],
  })
  ok(two.cycle_start === '2026-09-03' && one.cycle_start === '2026-09-10', '23 удалили первую — cycle_start сдвигается')
}

{
  const a = account({
    as_of: '2026-12-03',
    trainings: weeklyFrom('2026-09-03', '2026-12-03'),
    settings: { enabled: false, enabled_at: '2026-01-01', enabled_intervals: [{ start: '2026-01-01', end: '2026-12-03' }] },
  })
  ok(a.points > 0 && a.can_redeem === false && a.state === 'active', '24 enabled false → can_redeem false, points живы')
}

{
  const iv = applyProgramToggle([{ start: '2026-01-01', end: null }], { enabled: false, as_of: '2026-09-09' })
  const a = account({
    as_of: '2026-09-15',
    settings: { enabled: true, enabled_at: '2026-01-01', enabled_intervals: iv },
    trainings: [tr({ date: '2026-09-03' }), tr({ date: '2026-09-09' })],
  })
  ok(a.state === 'active' && a.cycle_start === '2026-09-03' && a.weeks_credited === 2, '25 смешанная неделя не burn')
}

ok(normalizeLoyaltySettings({ kcal_chunk: 0 }).kcal_chunk === 1, '26 chunk 0 → 1')
ok(!Number.isNaN(normalizeLoyaltySettings({ kcal_chunk: 'x' }).kcal_chunk), '26b chunk мусор → не NaN')

{
  const a = account({
    as_of: '2026-09-10',
    trainings: [tr({ id: 'before', date: '2026-09-03' }), tr({ id: 'after', date: '2026-09-10' })],
    ledger: [
      { kind: 'redeem', at: '2026-09-08T12:00:00.000Z', snapshot: settings(), points: 1 },
      { kind: 'burn_archive', at: '2026-09-08T12:00:00.000Z' },
    ],
  })
  ok(
    a.state === 'active' && a.cycle_start === '2026-09-10',
    '27 archive побеждает redeem в тот же at — цикл с тренировки после archive',
  )
}

{
  const a = account({
    as_of: '2026-09-10',
    archived_at: null,
    trainings: [tr({ date: '2026-09-10' })],
    ledger: [{ kind: 'burn_archive', at: '2026-09-05T12:00:00.000Z' }],
  })
  ok(a.state === 'active' && a.cycle_start === '2026-09-10', '28 restore: цикл с первой тренировки после archive.at')
}

{
  const start = Date.parse('2026-09-03T10:00:00.000Z')
  const one = computeLoyaltyKcal({
    samples: [{ t: start, bpm: 150 }],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  const hour = computeLoyaltyKcal({
    samples: [
      { t: start, bpm: 150 },
      { t: start + 60 * 60 * 1000, bpm: 150 },
    ],
    sessionStartedAt: '2026-09-03T10:00:00.000Z',
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  const expectOne = estimateKcalKeytel({
    avgBpm: 150,
    weightKg: 80,
    ageYears: 36,
    sex: 'male',
    durationMin: HR_SAMPLE_INTERVAL_MS / 60000,
  })
  ok(one === expectOne && one < hour, '29 один сэмпл = 5 с, не 60 мин')
}

{
  const off = applyProgramToggle([{ start: '2026-01-01', end: null }], { enabled: false, as_of: '2026-09-09' })
  const on = applyProgramToggle(off, { enabled: true, as_of: '2026-09-09' })
  ok(on.length === 1 && on[0].end == null && on[0].start === '2026-01-01', '30 toggle выкл+вкл тот же день — один интервал')
}

{
  const a = account({
    as_of: '2026-12-03',
    archived_at: '2026-09-20T10:00:00.000Z',
    trainings: [tr({ date: '2026-09-03' }), tr({ date: '2026-12-03' })],
    ledger: [{ kind: 'redeem', at: '2026-09-03T10:00:00.000Z', snapshot: settings(), points: 10 }],
  })
  ok(a.state === 'idle' && a.points === 0 && a.cycle_start == null, '31 archived_at → idle даже при redeem')
}

{
  const a = account({
    as_of: '2026-09-20',
    archived_at: null,
    trainings: [
      tr({ id: 'old', date: '2026-09-03' }),
      tr({ id: 'after', date: '2026-09-12' }),
    ],
    ledger: [{ kind: 'burn_archive', at: '2026-09-08T12:00:00.000Z' }],
  })
  ok(
    a.state === 'active' && a.cycle_start === '2026-09-12' && a.points === 50,
    '32 Вернуть: origin burn_archive, цикл после at, баллы до архива не вернулись',
  )
}

ok(!assertRedeemAllowed({ expected: 50, points: 50, can_redeem: false }), '33a !can_redeem')
ok(!assertRedeemAllowed({ expected: 40, points: 50, can_redeem: true }), '33b expected mismatch')
ok(assertRedeemAllowed({ expected: 50, points: 50, can_redeem: true }), '33c ok')

{
  const a = account({
    as_of: '2026-09-10',
    trainings: [tr({ id: 'old', date: '2026-09-03' }), tr({ id: 'new', date: '2026-09-10' })],
    ledger: [
      {
        kind: 'club_move',
        at: '2026-09-08T12:00:00.000Z',
        payload: { from: 'old-club', to: CLUB, club_moved_on: '2026-09-08' },
      },
    ],
  })
  ok(
    a.state === 'active' && a.cycle_start === '2026-09-10' && a.points === 50,
    'крит: переезд — цикл с первой тренировки после move, старые визиты не считаются',
  )
}

{
  const a = account({
    as_of: '2026-09-09',
    trainings: [tr({ date: '2026-09-03' })],
    ledger: [{ kind: 'redeem', at: '2026-09-09T12:00:00.000Z', snapshot: settings(), points: 50 }],
  })
  ok(
    a.state === 'active' && a.points === 0 && a.cycle_start === '2026-09-09' && a.kcal_remainder === 0,
    'крит: после redeem пустой цикл provisional active, remainder 0',
  )
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty verify ok')
