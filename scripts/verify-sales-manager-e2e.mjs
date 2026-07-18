/**
 * E2E smoke: менеджер по продажам на prod (auth + sales API).
 * Запуск: node scripts/verify-sales-manager-e2e.mjs
 * Другой хост: QA_ORIGIN=https://… node scripts/verify-sales-manager-e2e.mjs
 */
const BASE = process.env.QA_ORIGIN ?? 'https://fitness-diary-bice.vercel.app'
const LOGIN = process.env.QA_SALES_LOGIN ?? 'qa_auto_sales'
const PASSWORD = process.env.QA_PASSWORD ?? 'QaAuto2026!'
const CLUB_ID = 'd5cf1b9c-6fa5-4ece-bb00-d7a99aac71ea'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

async function parseJson(res) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: text.slice(0, 200) }
  }
}

const signInRes = await fetch(`${BASE}/api/auth-sign-in`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
})
const signIn = await parseJson(signInRes)
ok(signInRes.ok, `sign-in HTTP ${signInRes.status}`)
const token = signIn.session?.access_token ?? signIn.access_token
ok(Boolean(token), 'access_token received')
ok(
  signIn.profile?.role === 'sales_manager' || signIn.profile?.role === 'менеджер по продажам',
  'profile role sales_manager',
)

if (!token) {
  console.error('Cannot continue without token')
  process.exit(1)
}

const today = new Date()
const reportDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

const salesUrl = `${BASE}/api/admin-data?action=sales&club_id=${CLUB_ID}&report_date=${reportDate}`
const salesRes = await fetch(salesUrl, {
  headers: { Authorization: `Bearer ${token}` },
})
const bundle = await parseJson(salesRes)
ok(salesRes.ok, `sales GET HTTP ${salesRes.status}`)
ok(bundle.club_id === CLUB_ID, 'bundle club_id')
ok(bundle.expense === undefined, 'expense stripped for manager')
ok(!bundle.month_summary?.netProfit, 'netProfit stripped')
ok(bundle.plan !== undefined || bundle.daily !== undefined || Array.isArray(bundle.month_days), 'bundle shape ok')

const planLevelsRes = await fetch(`${BASE}/api/admin-data?action=sales-plan`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    club_id: CLUB_ID,
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    scope: 'levels',
    plan_level_1: 100000,
  }),
})
ok(planLevelsRes.status === 403, 'manager blocked from plan levels')

const listRes = await fetch(`${BASE}/api/list-trainers?role=sales_manager`, {
  headers: { Authorization: `Bearer ${token}` },
})
ok(listRes.status === 403 || listRes.status === 401, 'manager cannot list all managers')

process.exit(failed > 0 ? 1 : 0)
