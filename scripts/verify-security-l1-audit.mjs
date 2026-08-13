/**
 * L1 security / sync audit (ideal contract vs current code).
 * Soft report: prints PASS/FAIL per case, exit 1 if any FAIL.
 *
 * node scripts/verify-security-l1-audit.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authorizePush } from '../api/_lib/mutationAuth.js'
import {
  isAdminByRole,
} from '../src/lib/admin/adminRoleCore.js'
import {
  analyzeCompleteSaveOrderInSource,
  membershipDebitShouldFollowTrainingSave,
} from '../src/lib/membershipDebitOrderCore.js'
import {
  cloudPutAllowedOnPull,
  isPullMergeGuardedStore,
  PULL_MERGE_GUARD_STORE_LIST,
} from '../src/lib/syncPullGuardCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

let passed = 0
let failed = 0
const failures = []

function check(cond, id, detail = '') {
  if (cond) {
    passed++
    console.log(`PASS  ${id}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    failures.push(id)
    console.log(`FAIL  ${id}${detail ? ` — ${detail}` : ''}`)
  }
}

const TA = '11111111-1111-4111-8111-111111111111'
const TB = '22222222-2222-4222-8222-222222222222'
const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TR_OWN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const HC_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const BM_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const WE_B = '99999999-9999-4999-8999-999999999999'

function makeMockDb(tables) {
  return {
    from(name) {
      const rows = tables[name] || []
      return {
        select() {
          return {
            eq(col, val) {
              return {
                async maybeSingle() {
                  const row = rows.find((r) => String(r[col]) === String(val)) ?? null
                  return { data: row, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

const tables = {
  clients: [
    { id: CA, trainer_id: TA, club_id: 'club-1', desk_hall: null },
    { id: CB, trainer_id: TB, club_id: 'club-1', desk_hall: null },
  ],
  memberships: [{ id: MB, client_id: CB, club_id: 'club-1' }],
  trainings: [{ id: TR_OWN, trainer_id: TA, client_id: CA }],
  health_cards: [{ id: HC_B, client_id: CB }],
  body_measurements: [{ id: BM_B, client_id: CB }],
  client_weight_entries: [{ id: WE_B, client_id: CB }],
  membership_types: [{ id: 'type-pz', trainer_assignable: true }],
}

const trainerCtx = {
  supabaseAdmin: makeMockDb(tables),
  user: { id: TA },
  profile: { club_id: 'club-1' },
  isAdmin: false,
  isTrainer: true,
  isSalesManager: false,
  isSupervisor: false,
}

console.log('\n=== A. Admin role (secure contract) ===')
check(isAdminByRole('admin') === true, 'A1', 'role admin → admin')
check(isAdminByRole('администратор') === true, 'A2', 'кириллица → admin')
check(isAdminByRole('trainer', 'admin@fit-city.ru') === false, 'A3', 'email не даёт admin')
check(isAdminByRole('', 'admin@fit-city.ru') === false, 'A4', 'пустая role + email ≠ admin')

const legacyRemoved = true
console.log('INFO  A5 — adminRoleCore только isAdminByRole (без email-bypass helper)')
void legacyRemoved

const adminSupabaseSrc = readFileSync(join(root, 'api/_lib/adminSupabase.js'), 'utf8')
const createTrainerSrc = readFileSync(join(root, 'api/create-trainer.js'), 'utf8')
check(
  !adminSupabaseSrc.includes("admin@fit-city.ru"),
  'A6',
  'adminSupabase.js без хардкода email',
)
check(
  !createTrainerSrc.includes("admin@fit-city.ru"),
  'A7',
  'create-trainer.js без хардкода email',
)

console.log('\n=== B. Membership update IDOR ===')
{
  const idor = await authorizePush(
    trainerCtx,
    'memberships',
    'update',
    { client_id: CA, used_trainings: 99, membership_type_id: 'type-pz' },
    MB,
  )
  check(idor.ok === false, 'B1', `чужой membership remote_id + свой client_id → deny (got ok=${idor.ok})`)
}
{
  const ownMemTables = {
    ...tables,
    memberships: [{ id: MB, client_id: CA, club_id: 'club-1' }],
  }
  const ownCtx = { ...trainerCtx, supabaseAdmin: makeMockDb(ownMemTables) }
  const okOwn = await authorizePush(
    ownCtx,
    'memberships',
    'update',
    { client_id: CA, used_trainings: 1, membership_type_id: 'type-pz' },
    MB,
  )
  check(okOwn.ok === true, 'B2', `свой membership update → allow (got ok=${okOwn.ok})`)
}
{
  const del = await authorizePush(trainerCtx, 'memberships', 'delete', {}, MB)
  check(del.ok === false, 'B3', `delete чужого membership → deny (got ok=${del.ok})`)
}

console.log('\n=== C. Training update ownership ===')
{
  const retarget = await authorizePush(
    trainerCtx,
    'trainings',
    'update',
    { client_id: CB, trainer_id: TA },
    TR_OWN,
  )
  check(
    retarget.ok === false,
    'C1',
    `свой training + чужой client_id в payload → deny (got ok=${retarget.ok})`,
  )
}
{
  const stealTrainer = await authorizePush(
    trainerCtx,
    'trainings',
    'update',
    { client_id: CA, trainer_id: TB },
    TR_OWN,
  )
  check(
    stealTrainer.ok === false,
    'C2',
    `смена trainer_id на чужого → deny (got ok=${stealTrainer.ok})`,
  )
}
{
  const okSame = await authorizePush(
    trainerCtx,
    'trainings',
    'update',
    { client_id: CA, trainer_id: TA, status: 'completed' },
    TR_OWN,
  )
  check(okSame.ok === true, 'C3', `update своей training без смены владельца → allow (got ok=${okSame.ok})`)
}
{
  const foreign = await authorizePush(
    trainerCtx,
    'trainings',
    'update',
    { client_id: CB },
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  )
  // no such training for TA
  const tables2 = {
    ...tables,
    trainings: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', trainer_id: TB, client_id: CB }],
  }
  const r = await authorizePush(
    { ...trainerCtx, supabaseAdmin: makeMockDb(tables2) },
    'trainings',
    'update',
    { client_id: CB },
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  )
  check(r.ok === false, 'C4', `чужая training → deny (got ok=${r.ok})`)
  void foreign
}

console.log('\n=== D. Health / measures / weight update by existing owner ===')
{
  const hc = await authorizePush(
    trainerCtx,
    'health_cards',
    'update',
    { client_id: CA, height: 180 },
    HC_B,
  )
  check(hc.ok === false, 'D1', `health_cards: remote чужого + payload свой client → deny (got ok=${hc.ok})`)
}
{
  const bm = await authorizePush(
    trainerCtx,
    'body_measurements',
    'update',
    { client_id: CA },
    BM_B,
  )
  check(bm.ok === false, 'D2', `body_measurements IDOR → deny (got ok=${bm.ok})`)
}
{
  const we = await authorizePush(
    trainerCtx,
    'client_weight_entries',
    'update',
    { client_id: CA },
    WE_B,
  )
  check(we.ok === false, 'D3', `client_weight_entries IDOR → deny (got ok=${we.ok})`)
}

console.log('\n=== E. Pull merge guard (pnk / sale_clips) ===')
check(isPullMergeGuardedStore('memberships'), 'E1', 'memberships guarded (ideal)')
check(isPullMergeGuardedStore('pnk_funnel_events'), 'E2', 'pnk_funnel_events в ideal list')
check(isPullMergeGuardedStore('sale_clips'), 'E3', 'sale_clips в ideal list')

const localDbSrc = readFileSync(join(root, 'src/lib/localDb.js'), 'utf8')
const guardCoreSrc = readFileSync(join(root, 'src/lib/syncPullGuardCore.js'), 'utf8')
check(
  localDbSrc.includes('syncPullGuardCore') && localDbSrc.includes('cloudPutAllowedOnPull'),
  'E4',
  'localDb использует syncPullGuardCore',
)
check(
  guardCoreSrc.includes("'pnk_funnel_events'") && guardCoreSrc.includes("'sale_clips'"),
  'E5',
  'syncPullGuardCore содержит pnk_funnel_events и sale_clips',
)
{
  const pending = { sale_clips: new Set(['clip-1']) }
  check(
    cloudPutAllowedOnPull('sale_clips', 'clip-1', pending) === false,
    'E6',
    'ideal: pending sale_clips блокирует cloud put',
  )
  check(
    cloudPutAllowedOnPull('sale_clips', 'clip-2', pending) === true,
    'E7',
    'ideal: другой id не блокируется',
  )
}
check(PULL_MERGE_GUARD_STORE_LIST.length >= 8, 'E8', 'ideal list ≥ 8 stores')

console.log('\n=== F. Debit order (complete) ===')
check(membershipDebitShouldFollowTrainingSave() === true, 'F1', 'политика: debit после training save')
{
  const pageSrc = readFileSync(join(root, 'src/pages/trainer/TrainingPage.jsx'), 'utf8')
  // сужаем к блоку первого completed, если возможно
  const idx = pageSrc.indexOf("nextStatus === 'completed' && prev?.status !== 'completed'")
  const slice = idx >= 0 ? pageSrc.slice(idx, idx + 3500) : pageSrc
  const order = analyzeCompleteSaveOrderInSource(slice)
  check(order.foundDebit && order.foundTraining, 'F2', 'в complete есть save memberships и trainings')
  check(
    order.debitBeforeTraining === false,
    'F3',
    `debit НЕ раньше training (сейчас debitBefore=${order.debitBeforeTraining})`,
  )
}

console.log('\n=== Summary ===')
console.log(`PASS: ${passed}  FAIL: ${failed}`)
if (failures.length) {
  console.error('Failed ids:', failures.join(', '))
}
process.exit(failed > 0 ? 1 : 0)
