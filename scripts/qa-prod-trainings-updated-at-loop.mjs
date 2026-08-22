/**
 * Prod loop: QA @trainer.local → sign-in → trainings.updated_at push/pull.
 * node scripts/qa-prod-trainings-updated-at-loop.mjs
 */
import {
  QA_CLUB_ID,
  QA_PASSWORD,
  QA_PREFIX,
  PROD_ORIGIN,
  createSupabaseAdmin,
  deleteQaUsers,
  signInProd,
  tokenFromSignIn,
  upsertQaUser,
} from './lib/qaSupabaseAdmin.mjs'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

async function pushRecord(token, body) {
  const res = await fetch(`${PROD_ORIGIN}/api/push-record`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

const admin = createSupabaseAdmin()

console.log('▶ cleanup stale QA + recreate @trainer.local')
await deleteQaUsers(admin)
// сироты Auth со старым @qa.local
for (let page = 1; page <= 5; page++) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  for (const u of data?.users ?? []) {
    const email = String(u.email ?? '')
    if (!email.includes(QA_PREFIX)) continue
    console.log('  delete auth orphan', email)
    await admin.auth.admin.deleteUser(u.id)
  }
  if ((data?.users ?? []).length < 200) break
}

const trainer = await upsertQaUser(admin, {
  login: `${QA_PREFIX}trainer`,
  role: 'trainer',
  name: 'QA Trainer',
  club_id: QA_CLUB_ID,
})
const adminUser = await upsertQaUser(admin, {
  login: `${QA_PREFIX}admin`,
  role: 'admin',
  name: 'QA Admin',
  club_id: null,
})
console.log('  trainer', trainer.action, trainer.email)
console.log('  admin', adminUser.action, adminUser.email)

console.log('\n▶ sign-in by login (expects @trainer.local fast path)')
const trainerSign = await signInProd(trainer.login)
const trainerTok = tokenFromSignIn(trainerSign.data)
ok(trainerSign.ok && Boolean(trainerTok), `trainer login HTTP ${trainerSign.status} ${trainerSign.data?.error || ''}`)

const adminSign = await signInProd(adminUser.login)
const adminTok = tokenFromSignIn(adminSign.data)
ok(adminSign.ok && Boolean(adminTok), `admin login HTTP ${adminSign.status} ${adminSign.data?.error || ''}`)

if (!trainerTok) {
  console.error('stop: no trainer token')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const clientId = crypto.randomUUID()
const trainingId = crypto.randomUUID()
const membershipId = crypto.randomUUID()

console.log('\n▶ setup client + membership')
{
  const { error: cErr } = await admin.from('clients').upsert({
    id: clientId,
    club_id: QA_CLUB_ID,
    trainer_id: trainer.id,
    name: 'QA Auto Trainings UpdatedAt',
    phone: null,
    card_number: `QA-UAT-${String(clientId).slice(0, 8)}`,
    lifecycle: 'active',
    archived_at: null,
  })
  ok(!cErr, `client ${cErr?.message || 'ok'}`)
  const { error: mErr } = await admin.from('memberships').insert({
    id: membershipId,
    client_id: clientId,
    club_id: QA_CLUB_ID,
    start_date: today,
    end_date: today,
    total_trainings: 10,
    used_trainings: 0,
    status: 'active',
    hall: 'pz',
  })
  ok(!mErr, `membership ${mErr?.message || 'ok'}`)
}

const insertPayload = {
  id: trainingId,
  client_id: clientId,
  trainer_id: trainer.id,
  club_id: QA_CLUB_ID,
  date: today,
  type: 'Силовая',
  status: 'completed',
  data: { exercises: [], note: 'qa-updated-at-v1', membership_id: membershipId },
}

console.log('\n▶ push insert')
let firstAt = ''
{
  const out = await pushRecord(trainerTok, {
    table_name: 'trainings',
    operation: 'insert',
    data: insertPayload,
    remote_id: null,
  })
  ok(out.status === 200 && out.data?.ok !== false, `insert HTTP ${out.status} ${out.data?.error || ''}`)
  ok(Boolean(out.data?.record?.id), 'insert returns record')
  ok(Boolean(out.data?.record?.updated_at), `insert updated_at=${out.data?.record?.updated_at || 'missing'}`)
  firstAt = String(out.data?.record?.updated_at || '')
}

const { data: row1 } = await admin.from('trainings').select('status, updated_at, data').eq('id', trainingId).maybeSingle()
ok(row1?.status === 'completed', 'db status completed')
ok(Boolean(row1?.updated_at), `db updated_at=${row1?.updated_at || 'missing'}`)
if (!firstAt) firstAt = String(row1?.updated_at || '')

await new Promise((r) => setTimeout(r, 1100))

console.log('\n▶ push update')
{
  const out = await pushRecord(trainerTok, {
    table_name: 'trainings',
    operation: 'update',
    remote_id: trainingId,
    data: {
      ...insertPayload,
      data: { exercises: [{ id: 'e1', name: 'QA squat' }], note: 'qa-updated-at-v2', membership_id: membershipId },
    },
  })
  ok(out.status === 200 && out.data?.ok !== false, `update HTTP ${out.status} ${out.data?.error || ''}`)
  const second = String(out.data?.record?.updated_at || '')
  ok(Boolean(second), `update updated_at=${second || 'missing'}`)
  ok(second !== firstAt, `bumped ${firstAt} → ${second}`)
  ok(out.data?.record?.data?.note === 'qa-updated-at-v2', 'record note v2')
}

console.log('\n▶ trainer-pull')
{
  const res = await fetch(`${PROD_ORIGIN}/api/trainer-pull`, {
    headers: { Authorization: `Bearer ${trainerTok}` },
  })
  const data = await res.json().catch(() => ({}))
  ok(res.status === 200, `pull HTTP ${res.status}`)
  const found = (data.trainings || []).find((t) => t.id === trainingId)
  ok(Boolean(found), 'training in pull')
  ok(Boolean(found?.updated_at), `pull updated_at=${found?.updated_at || 'missing'}`)
  ok(found?.data?.note === 'qa-updated-at-v2', 'pull note v2')
}

console.log('\n▶ admin API smoke')
{
  const res = await fetch(`${PROD_ORIGIN}/api/admin-data?action=clubs`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  })
  ok(res.status === 200, `admin clubs HTTP ${res.status}`)
}

console.log('\n▶ cleanup data + QA users')
await admin.from('trainings').delete().eq('id', trainingId)
await admin.from('memberships').delete().eq('client_id', clientId)
await admin.from('clients').delete().eq('id', clientId)
await deleteQaUsers(admin)

if (failed) {
  console.error(`\nRESULT: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nRESULT: all ok')
