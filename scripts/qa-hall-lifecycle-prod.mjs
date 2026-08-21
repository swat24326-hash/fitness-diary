/**
 * Prod smoke: жизнь по направлениям (план A/B + API pull).
 * node scripts/qa-hall-lifecycle-prod.mjs
 *
 * Создаёт qa_auto_ клиентов в QA_CLUB, закрывает ПЗ через push-record, чистит за собой.
 */
import { randomUUID } from 'node:crypto'
import {
  planCloseHall,
  planLeaveClub,
  planReopenHall,
} from '../src/lib/clientHallLifecycleCore.js'
import {
  QA_CLUB_ID,
  QA_PASSWORD,
  QA_PREFIX,
  PROD_ORIGIN,
  createSupabaseAdmin,
  signInProd,
  tokenFromSignIn,
  upsertQaUser,
} from './lib/qaSupabaseAdmin.mjs'

const today = new Date()
const asOf = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const yesterday = (() => {
  const d = new Date(today)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

async function apiGet(path, token) {
  const res = await fetch(`${PROD_ORIGIN}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function pushRecord(token, table_name, operation, record) {
  const remote_id = operation === 'insert' ? null : record?.id != null ? String(record.id) : null
  const res = await fetch(`${PROD_ORIGIN}/api/push-record`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ table_name, operation, data: record, remote_id }),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, ok: res.ok }
}

async function hardDeleteClient(admin, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return
  await admin.from('client_hall_lifecycle').delete().eq('client_id', id)
  await admin.from('memberships').delete().eq('client_id', id)
  await admin.from('clients').delete().eq('id', id)
}

async function deleteQaUserByLogin(admin, login) {
  const { data: row } = await admin.from('users').select('id').eq('login', login).maybeSingle()
  if (!row?.id) return
  await admin.from('users').delete().eq('id', row.id)
  await admin.auth.admin.deleteUser(row.id)
}

console.log(`▶ hall-lifecycle prod smoke @ ${PROD_ORIGIN}`)

console.log('\n▶ 0 bundle / table')
{
  const html = await fetch(`${PROD_ORIGIN}/`).then((r) => r.text())
  const m = html.match(/\/assets\/(index-[^"]+\.js)/)
  ok(Boolean(m), 'index.html has JS bundle')
  if (m) {
    const js = await fetch(`${PROD_ORIGIN}/assets/${m[1]}`).then((r) => r.text())
    ok(js.includes('Закрыть ПЗ'), 'bundle: Закрыть ПЗ')
    ok(js.includes('Ушёл из клуба') || js.includes('Архив'), 'bundle: архив клуба')
    ok(js.includes('Закрытия ПЗ'), 'bundle: KPI Закрытия ПЗ')
    ok(js.includes('client_hall_lifecycle'), 'bundle: client_hall_lifecycle')
  }
}

const admin = createSupabaseAdmin()
{
  const { error } = await admin.from('client_hall_lifecycle').select('id').limit(1)
  ok(!error, `table client_hall_lifecycle readable (${error?.message ?? 'ok'})`)
}

console.log('\n▶ setup QA users')
const trainerUser = await upsertQaUser(admin, {
  login: `${QA_PREFIX}hl_trainer`,
  role: 'trainer',
  name: 'QA HL Trainer',
  club_id: QA_CLUB_ID,
})
const adminUser = await upsertQaUser(admin, {
  login: `${QA_PREFIX}hl_admin`,
  role: 'admin',
  name: 'QA HL Admin',
  club_id: null,
})
console.log(`  trainer ${trainerUser.action} ${trainerUser.email}`)
console.log(`  admin ${adminUser.action} ${adminUser.email}`)

// auth-sign-in: логин без @ сначала пробует @trainer.local и при fail не доходит до @qa.local —
// для QA входим по email строки users.
const trainerSign = await signInProd(trainerUser.email)
const adminSign = await signInProd(adminUser.email)
const trainerTok = tokenFromSignIn(trainerSign.data)
const adminTok = tokenFromSignIn(adminSign.data)
ok(trainerSign.ok && trainerTok, `trainer sign-in HTTP ${trainerSign.status} ${trainerSign.data?.error ?? ''}`)
ok(adminSign.ok && adminTok, `admin sign-in HTTP ${adminSign.status} ${adminSign.data?.error ?? ''}`)

const trainerId = trainerUser.id
ok(Boolean(trainerId), 'trainer profile id')

const createdIds = []

try {
  console.log('\n▶ A only-PZ → club archive')
  const cA = randomUUID()
  const mA = randomUUID()
  const lifeA = randomUUID()
  createdIds.push(cA)
  const clientA = {
    id: cA,
    club_id: QA_CLUB_ID,
    trainer_id: trainerId,
    name: 'QA HL OnlyPZ',
    phone: null,
    card_number: `QA-HL-A-${String(cA).slice(0, 8)}`,
    lifecycle: 'active',
    archived_at: null,
    archive_reason: null,
  }
  const memA = {
    id: mA,
    client_id: cA,
    club_id: QA_CLUB_ID,
    hall: 'pz',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 8,
    used_trainings: 1,
  }
  let r = await pushRecord(trainerTok, 'clients', 'insert', clientA)
  ok(r.ok, `A insert client HTTP ${r.status} ${r.data?.error ?? ''}`)
  r = await pushRecord(trainerTok, 'memberships', 'insert', memA)
  ok(r.ok, `A insert mem HTTP ${r.status} ${r.data?.error ?? ''}`)

  const planA = planCloseHall({
    client: clientA,
    hall: 'pz',
    reasonInput: 'не продлил',
    memberships: [memA],
    lifecycleRows: [],
    asOf,
  })
  ok(planA.ok && planA.clubArchiveEntered && planA.clientPatch?.archived_at, 'A plan: club archive')
  for (const patch of planA.membershipPatches ?? []) {
    r = await pushRecord(trainerTok, 'memberships', 'update', { ...memA, ...patch, end_date: yesterday })
    ok(r.ok, `A end mem HTTP ${r.status}`)
  }
  r = await pushRecord(trainerTok, 'client_hall_lifecycle', 'insert', {
    ...planA.lifecycleRow,
    id: lifeA,
  })
  ok(r.ok, `A lifecycle insert HTTP ${r.status} ${r.data?.error ?? ''}`)
  if (planA.clientPatch) {
    r = await pushRecord(trainerTok, 'clients', 'update', {
      ...clientA,
      ...planA.clientPatch,
    })
    ok(r.ok, `A client archive HTTP ${r.status} ${r.data?.error ?? ''}`)
  }
  {
    const { data } = await admin.from('clients').select('archived_at, archive_reason').eq('id', cA).maybeSingle()
    ok(Boolean(data?.archived_at), 'A DB archived_at set')
  }
  {
    const { data } = await admin
      .from('client_hall_lifecycle')
      .select('closed_at, hall')
      .eq('client_id', cA)
      .eq('hall', 'pz')
      .maybeSingle()
    ok(Boolean(data?.closed_at), 'A DB pz closed_at')
  }

  console.log('\n▶ B PZ+TZ → no club archive')
  const cB = randomUUID()
  const mBp = randomUUID()
  const mBt = randomUUID()
  const lifeB = randomUUID()
  createdIds.push(cB)
  const clientB = {
    id: cB,
    club_id: QA_CLUB_ID,
    trainer_id: trainerId,
    name: 'QA HL PZplusTZ',
    phone: null,
    card_number: `QA-HL-B-${String(cB).slice(0, 8)}`,
    lifecycle: 'active',
    archived_at: null,
  }
  const memBp = {
    id: mBp,
    client_id: cB,
    club_id: QA_CLUB_ID,
    hall: 'pz',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 8,
    used_trainings: 1,
  }
  const memBt = {
    id: mBt,
    client_id: cB,
    club_id: QA_CLUB_ID,
    hall: 'tz',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 0,
    used_trainings: 0,
  }
  r = await pushRecord(trainerTok, 'clients', 'insert', clientB)
  ok(r.ok, `B insert client HTTP ${r.status} ${r.data?.error ?? ''}`)
  r = await pushRecord(trainerTok, 'memberships', 'insert', memBp)
  ok(r.ok, `B insert pz mem HTTP ${r.status}`)
  r = await pushRecord(trainerTok, 'memberships', 'insert', memBt)
  ok(r.ok, `B insert tz mem HTTP ${r.status}`)

  const planB = planCloseHall({
    client: clientB,
    hall: 'pz',
    reasonInput: 'Перешёл в ТЗ',
    memberships: [memBp, memBt],
    lifecycleRows: [],
    asOf,
  })
  ok(planB.ok && !planB.clubArchiveEntered && !planB.clientPatch?.archived_at, 'B plan: no club archive')
  ok(planB.burnsLoyaltyPz === true, 'B plan: loyalty burn on pz close')
  for (const patch of planB.membershipPatches ?? []) {
    r = await pushRecord(trainerTok, 'memberships', 'update', {
      ...memBp,
      ...patch,
      end_date: yesterday,
    })
    ok(r.ok, `B end pz mem HTTP ${r.status}`)
  }
  r = await pushRecord(trainerTok, 'client_hall_lifecycle', 'insert', {
    ...planB.lifecycleRow,
    id: lifeB,
  })
  ok(r.ok, `B lifecycle insert HTTP ${r.status} ${r.data?.error ?? ''}`)
  {
    const { data } = await admin.from('clients').select('archived_at').eq('id', cB).maybeSingle()
    ok(!data?.archived_at, 'B DB still not club-archived')
  }
  {
    const { data: tz } = await admin.from('memberships').select('end_date').eq('id', mBt).maybeSingle()
    ok(String(tz?.end_date ?? '').slice(0, 10) === '2026-12-31', 'B TZ mem still live')
  }

  console.log('\n▶ D reopen without live PZ mem')
  {
    const reopenBad = planReopenHall({
      client: { ...clientB, archived_at: null },
      hall: 'pz',
      memberships: [{ ...memBp, end_date: yesterday }, memBt],
      lifecycleRows: [{ ...planB.lifecycleRow, id: lifeB }],
      asOf,
    })
    ok(reopenBad.ok === false, `D reopen rejected: ${reopenBad.error ?? 'no error'}`)
  }

  console.log('\n▶ F leave club with live TZ')
  const cF = randomUUID()
  createdIds.push(cF)
  const clientF = {
    id: cF,
    club_id: QA_CLUB_ID,
    trainer_id: trainerId,
    name: 'QA HL Leave',
    card_number: `QA-HL-F-${String(cF).slice(0, 8)}`,
    lifecycle: 'active',
    archived_at: null,
  }
  const mFp = randomUUID()
  const mFt = randomUUID()
  r = await pushRecord(trainerTok, 'clients', 'insert', clientF)
  ok(r.ok, `F insert client HTTP ${r.status}`)
  await pushRecord(trainerTok, 'memberships', 'insert', {
    id: mFp,
    client_id: cF,
    club_id: QA_CLUB_ID,
    hall: 'pz',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 8,
    used_trainings: 0,
  })
  await pushRecord(trainerTok, 'memberships', 'insert', {
    id: mFt,
    client_id: cF,
    club_id: QA_CLUB_ID,
    hall: 'tz',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 0,
    used_trainings: 0,
  })
  const leave = planLeaveClub({
    client: clientF,
    reasonInput: 'ушёл из клуба',
    memberships: [
      {
        id: mFp,
        client_id: cF,
        hall: 'pz',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        total_trainings: 8,
        used_trainings: 0,
      },
      {
        id: mFt,
        client_id: cF,
        hall: 'tz',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        total_trainings: 0,
        used_trainings: 0,
      },
    ],
    lifecycleRows: [],
    asOf,
  })
  ok(leave.ok && leave.clientPatch?.archived_at, 'F plan: archives club')
  ok((leave.lifecycleRows ?? []).every((row) => row.closed_at), 'F plan: all halls closed')
  for (const row of leave.lifecycleRows ?? []) {
    r = await pushRecord(adminTok, 'client_hall_lifecycle', 'insert', row)
    ok(r.ok, `F lifecycle ${row.hall} HTTP ${r.status} ${r.data?.error ?? ''}`)
  }
  for (const patch of leave.membershipPatches ?? []) {
    r = await pushRecord(adminTok, 'memberships', 'update', { id: patch.id, ...patch, end_date: yesterday })
    ok(r.ok || r.status === 200, `F end mem ${patch.id} HTTP ${r.status}`)
  }
  r = await pushRecord(adminTok, 'clients', 'update', { ...clientF, ...leave.clientPatch })
  ok(r.ok, `F archive client HTTP ${r.status} ${r.data?.error ?? ''}`)
  {
    const { data } = await admin.from('clients').select('archived_at').eq('id', cF).maybeSingle()
    ok(Boolean(data?.archived_at), 'F DB archived')
  }

  console.log('\n▶ pull / list-memberships lifecycle')
  {
    const pull = await apiGet('/api/trainer-pull?skip_trainings=1', trainerTok)
    ok(pull.status === 200, `trainer-pull HTTP ${pull.status}`)
    const life = pull.data?.client_hall_lifecycle
    ok(Array.isArray(life), 'trainer-pull has client_hall_lifecycle[]')
    const hasB = (life ?? []).some((row) => String(row.client_id) === cB && row.hall === 'pz' && row.closed_at)
    ok(hasB, 'trainer-pull includes closed PZ for B')
  }
  {
    const mem = await apiGet(`/api/list-memberships?club_id=${encodeURIComponent(QA_CLUB_ID)}`, adminTok)
    ok(mem.status === 200, `list-memberships HTTP ${mem.status}`)
    ok(Array.isArray(mem.data?.client_hall_lifecycle), 'list-memberships returns client_hall_lifecycle')
    const hasA = (mem.data?.client_hall_lifecycle ?? []).some(
      (row) => String(row.client_id) === cA && row.hall === 'pz' && row.closed_at,
    )
    ok(hasA, 'admin list-memberships sees A lifecycle')
  }

  console.log('\n▶ O retention payload has pzChurn fields')
  {
    const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const ret = await apiGet(
      `/api/admin-data?action=client-retention&club_id=${encodeURIComponent(QA_CLUB_ID)}&date_from=${from}&date_to=${asOf}`,
      adminTok,
    )
    ok(ret.status === 200, `client-retention HTTP ${ret.status}`)
    const cr = ret.data?.clientRetention
    ok(cr && 'pzChurnRate' in cr && 'pzChurnInPeriod' in cr, 'retention has pzChurn* fields')
    ok((cr?.pzChurnInPeriod ?? 0) >= 1, `pzChurnInPeriod >= 1 (got ${cr?.pzChurnInPeriod})`)
  }
} finally {
  console.log('\n▶ cleanup')
  for (const id of createdIds) {
    await hardDeleteClient(admin, id)
  }
  await deleteQaUserByLogin(admin, `${QA_PREFIX}hl_trainer`)
  await deleteQaUserByLogin(admin, `${QA_PREFIX}hl_admin`)
  await deleteQaUserByLogin(admin, `${QA_PREFIX}hl_t2`)
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\n✓ hall-lifecycle prod smoke passed')
