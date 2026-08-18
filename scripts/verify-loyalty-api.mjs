/**
 * node scripts/verify-loyalty-api.mjs
 * Лояльность C: доступ, 403/409, настройки, cycle_open, не в очереди sync.
 */
import { readFileSync } from 'node:fs'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORE_LIST } from '../src/lib/syncPullGuardCore.js'
import { shouldInsertLoyaltyCycleOpen } from '../src/lib/loyalty/loyaltyAccountCore.js'
import {
  LOYALTY_ERR,
  assertLoyaltyAccountAccess,
  assertLoyaltyJournalAccess,
  assertLoyaltyRedeemAccess,
  assertLoyaltySettingsGet,
  assertLoyaltySettingsPost,
  clipLoyaltyRedeemComment,
  parseLoyaltyGlanceIds,
} from '../src/lib/loyalty/loyaltyAccessCore.js'
import { decideLoyaltyRedeem } from '../src/lib/loyalty/loyaltyRedeemDecisionCore.js'
import { applyLoyaltySettingsPost } from '../src/lib/loyalty/loyaltySettingsWriteCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const CLUB = 'club-1'
const OTHER = 'club-2'
const admin = { isAdmin: true, profile: { id: 'a1', club_id: CLUB } }
const trainer = { isTrainer: true, isAdmin: false, profile: { id: 't1', club_id: CLUB }, user: { id: 't1' } }
const sales = { isSalesManager: true, salesClubId: CLUB, profile: { id: 's1', club_id: CLUB } }
const supervisor = { isSupervisor: true, supervisorClubId: CLUB, profile: { id: 'u1', club_id: CLUB } }
const trainerOtherClub = { isTrainer: true, profile: { id: 't2', club_id: OTHER }, user: { id: 't2' } }

ok(assertLoyaltySettingsGet(trainer, CLUB).ok === true, '1 trainer GET settings своего клуба')
ok(assertLoyaltySettingsGet(trainer, OTHER).ok === false, '1b trainer чужой клуб settings')
ok(assertLoyaltySettingsPost(trainer, CLUB).status === 403, '2 trainer POST settings 403')
ok(assertLoyaltySettingsPost(admin, CLUB).ok === true, '2b admin POST settings')
ok(assertLoyaltySettingsPost(sales, CLUB).status === 403, '2c sales POST settings 403')

ok(assertLoyaltyRedeemAccess(trainer, CLUB).status === 403, '3 trainer redeem 403')
ok(assertLoyaltyRedeemAccess(trainer, CLUB).error === LOYALTY_ERR.trainerRedeem, '3b текст тренера')
ok(assertLoyaltyRedeemAccess(sales, CLUB).ok === true, '3c sales redeem своего клуба')
ok(assertLoyaltyRedeemAccess(sales, OTHER).ok === false, '3d sales чужой клуб')
ok(assertLoyaltyRedeemAccess(supervisor, CLUB).status === 403, '3e supervisor не списывает')
ok(assertLoyaltyRedeemAccess(admin, CLUB).ok === true, '3f admin redeem')
ok(assertLoyaltyJournalAccess(trainer, CLUB).status === 403, '3g trainer journal 403')
ok(assertLoyaltyJournalAccess(sales, CLUB).ok === true, '3h sales journal')

ok(
  assertLoyaltyAccountAccess(trainer, { clubId: CLUB, clientTrainerId: 't1' }).ok === true,
  '4 trainer свой клиент',
)
ok(
  assertLoyaltyAccountAccess(trainer, { clubId: CLUB, clientTrainerId: 'other' }).status === 403,
  '4b trainer чужой клиент',
)
ok(
  assertLoyaltyAccountAccess(trainer, { clubId: CLUB, clientTrainerId: 'other' }).error === LOYALTY_ERR.noClient,
  '4c текст чужого клиента',
)
ok(
  assertLoyaltyAccountAccess(trainerOtherClub, { clubId: CLUB, clientTrainerId: 't2' }).ok === false,
  '4d trainer другого клуба',
)
ok(
  assertLoyaltyAccountAccess(sales, { clubId: CLUB, clientTrainerId: 't1' }).ok === true,
  '4e sales любой клиент клуба',
)
ok(
  assertLoyaltyAccountAccess(supervisor, { clubId: CLUB, clientTrainerId: 't1' }).ok === true,
  '4f supervisor read',
)

{
  const off = decideLoyaltyRedeem({
    snapshot: { enabled: false, points: 50, can_redeem: true },
    expected_points: 50,
  })
  ok(off.status === 400 && off.error === LOYALTY_ERR.programOff, '5 программа выкл → 400')
}

{
  const early = decideLoyaltyRedeem({
    snapshot: { enabled: true, points: 50, can_redeem: false },
    expected_points: 50,
  })
  ok(early.status === 400 && early.error === LOYALTY_ERR.cannotRedeem, '6 !can_redeem → 400')
}

{
  const stale = decideLoyaltyRedeem({
    snapshot: { enabled: true, points: 50, can_redeem: true },
    expected_points: 40,
  })
  ok(stale.status === 409 && stale.error === LOYALTY_ERR.stalePoints, '7 expected mismatch → 409')
}

{
  const okRedeem = decideLoyaltyRedeem({
    snapshot: { enabled: true, points: 50, can_redeem: true },
    expected_points: 50,
  })
  ok(okRedeem.ok === true && okRedeem.points === 50, '8 redeem ок')
}

ok(clipLoyaltyRedeemComment('  x'.repeat(300)).length === 200, '9 comment ≤ 200')
ok(clipLoyaltyRedeemComment('') === '', '9b пустой comment можно')

{
  const ids = parseLoyaltyGlanceIds('a,b, a')
  ok(ids.ok && ids.ids.length === 2, '10 glance unique ids')
}
ok(parseLoyaltyGlanceIds([]).status === 400, '10b пустой glance')
ok(parseLoyaltyGlanceIds(Array.from({ length: 201 }, (_, i) => `id${i}`)).status === 400, '10c >200 → 400')
ok(parseLoyaltyGlanceIds(Array.from({ length: 200 }, (_, i) => `id${i}`)).ok === true, '10d 200 ок')

{
  const firstOn = applyLoyaltySettingsPost({ enabled: false }, { enabled: true }, '2026-09-09')
  ok(firstOn.settings.enabled === true && firstOn.settings.enabled_at === '2026-09-09', '11 первое вкл пишет enabled_at')
  ok(firstOn.settings.enabled_intervals.some((iv) => iv.start === '2026-09-09' && iv.end == null), '11b открытый интервал')
  ok(firstOn.toggled === true, '11c toggled')
}

{
  const rates = applyLoyaltySettingsPost(
    { enabled: true, enabled_at: '2026-01-01', enabled_intervals: [{ start: '2026-01-01', end: null }], points_per_week: 50 },
    { points_per_week: 80 },
    '2026-09-09',
  )
  ok(rates.settings.points_per_week === 80 && rates.toggled === false, '12 смена ставок без тумблера')
  ok(rates.settings.enabled_intervals[0].end == null, '12b интервал не закрыли')
}

{
  const off = applyLoyaltySettingsPost(
    { enabled: true, enabled_at: '2026-01-01', enabled_intervals: [{ start: '2026-01-01', end: null }] },
    { enabled: false },
    '2026-09-09',
  )
  ok(off.settings.enabled === false && off.settings.enabled_intervals[0].end === '2026-09-09', '13 выкл end=as_of')
}

ok(
  shouldInsertLoyaltyCycleOpen({ state: 'active', cycle_start: '2026-09-03' }, []) === true,
  '14 cycle_open для ACTIVE без строки',
)
ok(
  shouldInsertLoyaltyCycleOpen(
    { state: 'active', cycle_start: '2026-09-03' },
    [{ kind: 'cycle_open', payload: { cycle_start: '2026-09-03' } }],
  ) === false,
  '14b не дублировать cycle_open',
)
ok(
  shouldInsertLoyaltyCycleOpen(
    { state: 'active', cycle_start: '2026-09-09' },
    [{ kind: 'redeem', at: '2026-09-09T12:00:00.000Z' }],
  ) === false,
  '14c provisional после redeem — без cycle_open',
)
ok(
  shouldInsertLoyaltyCycleOpen(
    { state: 'active', cycle_start: '2026-09-16' },
    [{ kind: 'redeem', at: '2026-09-09T12:00:00.000Z' }],
  ) === true,
  '14d новый цикл после дырки — cycle_open',
)
ok(shouldInsertLoyaltyCycleOpen({ state: 'idle', cycle_start: null }, []) === false, '14e idle — нет')

ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '15 ledger не в push allowlist')
ok(!PUSH_ALLOWED_TABLES.has('club_loyalty_settings'), '15b settings не в push')
ok(!PULL_MERGE_GUARD_STORE_LIST.includes('loyalty_glance'), '15c glance не в pull-guard очереди')
ok(!PULL_MERGE_GUARD_STORE_LIST.includes('loyalty_ledger'), '15d ledger не в pull-guard')

{
  const sql = readFileSync(new URL('../supabase/migrations/20260818235900_loyalty.sql', import.meta.url), 'utf8')
  ok(/ENABLE ROW LEVEL SECURITY/.test(sql), '16 миграция включает RLS')
  ok(!/CREATE POLICY/i.test(sql), '16b нет политик anon/authenticated — только service role')
  ok(/club_loyalty_settings/.test(sql) && /loyalty_ledger/.test(sql), '16c обе таблицы')
  ok(/loyalty_ledger_cycle_open_uniq/.test(sql), '16d unique cycle_open в миграции')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty api verify ok')
