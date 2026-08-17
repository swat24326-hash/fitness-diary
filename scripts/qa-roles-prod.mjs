/**
 * Prod QA по ролям: создать qa_auto_* → API smoke → cleanup.
 * node scripts/qa-roles-prod.mjs [--keep-users]
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

const keepUsers = process.argv.includes('--keep-users')
const today = new Date()
const reportDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

let failed = 0
const report = { created: [], deleted: [], checks: [], fixes: [] }

function ok(cond, msg, role = 'all') {
  report.checks.push({ role, msg, pass: !!cond })
  if (cond) console.log(`ok [${role}]: ${msg}`)
  else {
    console.error(`FAIL [${role}]: ${msg}`)
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

async function apiPost(path, token, body) {
  const res = await fetch(`${PROD_ORIGIN}${path}`, {
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

console.log('▶ setup QA users')
const admin = createSupabaseAdmin()
for (const spec of [
  { login: `${QA_PREFIX}admin`, role: 'admin', name: 'QA Admin', club_id: null },
  { login: `${QA_PREFIX}trainer`, role: 'trainer', name: 'QA Trainer', club_id: QA_CLUB_ID },
  { login: `${QA_PREFIX}sales`, role: 'sales_manager', name: 'QA Sales', club_id: QA_CLUB_ID },
]) {
  const row = await upsertQaUser(admin, spec)
  report.created.push(row)
  console.log(`  ${row.action}: ${row.login} (${row.role})`)
}

console.log('\n▶ sign-in')
const sessions = {}
for (const login of [`${QA_PREFIX}admin`, `${QA_PREFIX}trainer`, `${QA_PREFIX}sales`]) {
  const { ok: signed, status, data } = await signInProd(login)
  ok(signed, `sign-in ${login} HTTP ${status}`, login.replace(QA_PREFIX, ''))
  const token = tokenFromSignIn(data)
  ok(Boolean(token), `token ${login}`, login.replace(QA_PREFIX, ''))
  sessions[login] = { token, profile: data.profile, role: data.profile?.role }
}

const adminTok = sessions[`${QA_PREFIX}admin`]?.token
const trainerTok = sessions[`${QA_PREFIX}trainer`]?.token
const salesTok = sessions[`${QA_PREFIX}sales`]?.token

console.log('\n▶ admin API')
{
  const clubs = await apiGet('/api/admin-data?action=clubs', adminTok)
  ok(clubs.status === 200, 'admin GET clubs', 'admin')
  ok(Array.isArray(clubs.data?.clubs), 'admin clubs array', 'admin')

  const trainers = await apiGet('/api/list-trainers', adminTok)
  ok(trainers.status === 200, 'admin list-trainers', 'admin')

  const sales = await apiGet(
    `/api/admin-data?action=sales&club_id=${QA_CLUB_ID}&report_date=${reportDate}`,
    adminTok,
  )
  ok(sales.status === 200, 'admin sales bundle', 'admin')
  ok(sales.data?.expense !== undefined || sales.data?.month_summary, 'admin sees finance fields', 'admin')

  const createMgr = await apiPost('/api/admin-data?action=create-sales-manager', adminTok, {
    name: 'QA Temp Manager',
    login: `${QA_PREFIX}temp_mgr`,
    password: QA_PASSWORD,
    club_id: QA_CLUB_ID,
  })
  ok(createMgr.status === 200, 'admin create-sales-manager', 'admin')
  if (createMgr.data?.id) {
    await admin.from('users').delete().eq('id', createMgr.data.id)
    await admin.auth.admin.deleteUser(createMgr.data.id)
  }
}

console.log('\n▶ trainer API')
{
  const pull = await apiGet('/api/trainer-pull', trainerTok)
  ok(pull.status === 200, 'trainer-pull GET', 'trainer')

  const adminClubs = await apiGet('/api/admin-data?action=clubs', trainerTok)
  ok(adminClubs.status === 403 || adminClubs.status === 401, 'trainer blocked from admin clubs', 'trainer')

  const sales = await apiGet(
    `/api/admin-data?action=sales&club_id=${QA_CLUB_ID}&report_date=${reportDate}`,
    trainerTok,
  )
  ok(sales.status === 403, 'trainer blocked from sales', 'trainer')
}

console.log('\n▶ sales_manager API')
{
  const sales = await apiGet(
    `/api/admin-data?action=sales&club_id=${QA_CLUB_ID}&report_date=${reportDate}`,
    salesTok,
  )
  ok(sales.status === 200, 'sales GET own club', 'sales')
  ok(sales.data?.expense === undefined, 'sales expense stripped', 'sales')
  ok(!sales.data?.month_summary?.netProfit, 'sales netProfit stripped', 'sales')
  ok(sales.data?.month_summary?.netProfitMargin === undefined, 'sales netProfitMargin stripped', 'sales')

  const otherClub = '00000000-0000-4000-8000-000000000001'
  const foreign = await apiGet(
    `/api/admin-data?action=sales&club_id=${otherClub}&report_date=${reportDate}`,
    salesTok,
  )
  ok(foreign.status === 403, 'sales blocked other club', 'sales')

  const planLevels = await apiPost('/api/admin-data?action=sales-plan', salesTok, {
    club_id: QA_CLUB_ID,
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    scope: 'levels',
    plan_level_1: 1000000,
  })
  ok(planLevels.status === 403, 'sales blocked plan levels', 'sales')

  const listTrainers = await apiGet('/api/list-trainers?role=sales_manager', salesTok)
  ok(listTrainers.status === 403 || listTrainers.status === 401, 'sales blocked list managers', 'sales')

  /** sale-clips: на проде до деплоя/миграции — 400/403/404/405/500; после — 200 + clips[]. */
  const clipsNotReady = new Set([400, 403, 404, 405, 500])
  const clipsGet = await apiGet(
    `/api/admin-data?action=sale-clips&club_id=${QA_CLUB_ID}&clip_date=${reportDate}`,
    salesTok,
  )
  ok(
    clipsGet.status === 200 || clipsNotReady.has(clipsGet.status),
    `sales GET sale-clips HTTP ${clipsGet.status}${clipsGet.status === 200 ? '' : ' (ещё не на проде / нет таблицы)'}`,
    'sales',
  )
  if (clipsGet.status === 200) {
    ok(Array.isArray(clipsGet.data?.clips), 'sales sale-clips list array', 'sales')
  }

  const clipsTrainer = await apiGet(
    `/api/admin-data?action=sale-clips&club_id=${QA_CLUB_ID}&clip_date=${reportDate}`,
    trainerTok,
  )
  ok(
    clipsTrainer.status === 403 || clipsTrainer.status === 401 || clipsTrainer.status === 400,
    `trainer blocked from sale-clips HTTP ${clipsTrainer.status}`,
    'trainer',
  )
  ok(clipsTrainer.status !== 200, 'trainer cannot list sale-clips', 'trainer')

  const clipsAdmin = await apiGet(
    `/api/admin-data?action=sale-clips&club_id=${QA_CLUB_ID}&clip_date=${reportDate}`,
    adminTok,
  )
  ok(
    clipsAdmin.status === 200 || clipsNotReady.has(clipsAdmin.status),
    `admin GET sale-clips HTTP ${clipsAdmin.status}${clipsAdmin.status === 200 ? '' : ' (ещё не на проде / нет таблицы)'}`,
    'admin',
  )
  if (clipsAdmin.status === 200) {
    ok(Array.isArray(clipsAdmin.data?.clips), 'admin sale-clips list array', 'admin')
  }
}

console.log('\n▶ trainer-pay-profiles (кабинет ЗП)')
{
  /** До деплоя action/таблицы — 400/404/405/500; после — 200 (+ migration_needed если нет таблицы). */
  const payNotReady = new Set([400, 404, 405, 500])
  const payPath = `/api/admin-data?action=trainer-pay-profiles&club_id=${QA_CLUB_ID}`
  const adminPay = await apiGet(payPath, adminTok)
  ok(
    adminPay.status === 200 || payNotReady.has(adminPay.status),
    `admin GET trainer-pay-profiles HTTP ${adminPay.status}${adminPay.status === 200 ? '' : ' (ещё не на проде)'}`,
    'admin',
  )
  if (adminPay.status === 200) {
    ok(adminPay.data?.ok === true, 'admin pay-profiles ok', 'admin')
    ok(Array.isArray(adminPay.data?.profiles), 'admin pay-profiles list', 'admin')
  }

  const trainerPay = await apiGet(payPath, trainerTok)
  ok(
    trainerPay.status === 403 || trainerPay.status === 401,
    `trainer blocked trainer-pay-profiles HTTP ${trainerPay.status}`,
    'trainer',
  )
  ok(trainerPay.status !== 200, 'trainer cannot list pay-profiles', 'trainer')

  const salesPay = await apiGet(payPath, salesTok)
  ok(
    salesPay.status === 403 || salesPay.status === 401,
    `sales blocked trainer-pay-profiles HTTP ${salesPay.status}`,
    'sales',
  )
  ok(salesPay.status !== 200, 'sales cannot list pay-profiles', 'sales')

  const trainerId = report.created.find((u) => u.login === `${QA_PREFIX}trainer`)?.id
  if (adminPay.status === 200 && trainerId && !adminPay.data?.migration_needed) {
    const save = await apiPost('/api/admin-data?action=trainer-pay-profiles', adminTok, {
      trainer_id: trainerId,
      club_id: QA_CLUB_ID,
      on_plan: false,
      rate_adjustment_rub: 25,
    })
    ok(save.status === 200 && save.data?.profile?.on_plan === false, 'admin upsert pay-profile', 'admin')
    ok(Number(save.data?.profile?.rate_adjustment_rub) === 25, 'admin upsert adj 25', 'admin')

    const salesSave = await apiPost('/api/admin-data?action=trainer-pay-profiles', salesTok, {
      trainer_id: trainerId,
      club_id: QA_CLUB_ID,
      on_plan: true,
      rate_adjustment_rub: 0,
    })
    ok(
      salesSave.status === 403 || salesSave.status === 401,
      `sales blocked POST pay-profiles HTTP ${salesSave.status}`,
      'sales',
    )

    await admin.from('trainer_pay_profiles').delete().eq('trainer_id', trainerId)
  }

  const planPath = `/api/admin-data?action=trainer-pay-plan-settings&club_id=${QA_CLUB_ID}`
  const adminPlan = await apiGet(planPath, adminTok)
  ok(
    adminPlan.status === 200 || payNotReady.has(adminPlan.status),
    `admin GET trainer-pay-plan-settings HTTP ${adminPlan.status}${adminPlan.status === 200 ? '' : ' (ещё не на проде)'}`,
    'admin',
  )
  const salesPlan = await apiGet(planPath, salesTok)
  ok(
    salesPlan.status === 403 || salesPlan.status === 401,
    `sales blocked pay-plan-settings HTTP ${salesPlan.status}`,
    'sales',
  )
}

console.log('\n▶ route guards (unauthenticated)')
{
  const home = await fetch(`${PROD_ORIGIN}/`)
  ok(home.status === 200, 'GET / public', 'public')
}

if (!keepUsers) {
  console.log('\n▶ cleanup QA users')
  const temp = await admin.from('users').select('id, login').eq('login', `${QA_PREFIX}temp_mgr`).maybeSingle()
  if (temp.data?.id) {
    await admin.from('users').delete().eq('id', temp.data.id)
    await admin.auth.admin.deleteUser(temp.data.id)
  }
  report.deleted = await deleteQaUsers(admin)
  for (const d of report.deleted) console.log(`  deleted: ${d.login}`)
}

console.log('\n--- summary ---')
console.log(`checks: ${report.checks.length}, failed: ${failed}`)
if (!keepUsers) console.log(`deleted users: ${report.deleted.length}`)

process.exit(failed > 0 ? 1 : 0)
