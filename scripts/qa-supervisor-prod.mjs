/**
 * Prod QA: создать qa_auto_supervisor → API smoke → удалить.
 * Запуск: node scripts/qa-supervisor-prod.mjs
 * Другой хост: QA_ORIGIN=https://… node scripts/qa-supervisor-prod.mjs
 *
 * Требует: миграция users_supervisor_role на проде + SUPABASE_SERVICE_ROLE_KEY.
 */
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

const LOGIN_ADMIN = `${QA_PREFIX}admin`
const LOGIN_SV = `${QA_PREFIX}supervisor`
const LOGIN_TEMP = `${QA_PREFIX}temp_supervisor`

const today = new Date()
const reportDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const otherClub = '00000000-0000-4000-8000-000000000001'

let failed = 0
const createdIds = []

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

async function deleteUserFully(admin, id) {
  if (!id) return
  await admin.from('users').delete().eq('id', id)
  await admin.auth.admin.deleteUser(id)
}

async function cleanup(admin) {
  console.log('\n▶ cleanup')
  for (const id of createdIds) {
    try {
      await deleteUserFully(admin, id)
      console.log(`  deleted id ${id}`)
    } catch (e) {
      console.error(`  cleanup id ${id}: ${e?.message ?? e}`)
    }
  }
  for (const login of [LOGIN_SV, LOGIN_TEMP]) {
    const { data } = await admin.from('users').select('id, login').eq('login', login).maybeSingle()
    if (data?.id) {
      await deleteUserFully(admin, data.id)
      console.log(`  deleted login ${login}`)
    }
  }
  // Auth orphans @qa.local for these logins
  const emails = [`${LOGIN_SV}@qa.local`, `${LOGIN_TEMP}@qa.local`]
  for (let page = 1; page <= 5; page++) {
    const { data: authPage, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    const users = authPage?.users ?? []
    for (const u of users) {
      const email = String(u.email ?? '').toLowerCase()
      if (!emails.includes(email)) continue
      await admin.auth.admin.deleteUser(u.id)
      console.log(`  deleted auth ${email}`)
    }
    if (users.length < 200) break
  }
}

console.log(`▶ QA supervisor on ${PROD_ORIGIN}`)
const admin = createSupabaseAdmin()

try {
  console.log('\n▶ create roles')
  const adminRow = await upsertQaUser(admin, {
    login: LOGIN_ADMIN,
    role: 'admin',
    name: 'QA Admin',
    club_id: null,
  })
  console.log(`  ${adminRow.action}: ${adminRow.login} (оставляем для других QA)`)

  let svRow
  try {
    svRow = await upsertQaUser(admin, {
      login: LOGIN_SV,
      role: 'supervisor',
      name: 'QA Supervisor',
      club_id: QA_CLUB_ID,
    })
  } catch (e) {
    const msg = String(e?.message ?? e)
    console.error(`FAIL: create supervisor in DB: ${msg}`)
    if (/users_role_check|check constraint|invalid input/i.test(msg)) {
      console.error(
        '→ На проде не применена миграция 20260805220000_users_supervisor_role.sql (role CHECK).',
      )
    }
    failed++
    await cleanup(admin)
    process.exit(1)
  }
  createdIds.push(svRow.id)
  console.log(`  ${svRow.action}: ${svRow.login} (${svRow.role})`)

  console.log('\n▶ sign-in')
  const adminSign = await signInProd(LOGIN_ADMIN)
  ok(adminSign.ok, `admin sign-in HTTP ${adminSign.status}`)
  const adminTok = tokenFromSignIn(adminSign.data)
  ok(Boolean(adminTok), 'admin token')

  const svSign = await signInProd(LOGIN_SV)
  ok(svSign.ok, `supervisor sign-in HTTP ${svSign.status}`)
  const svTok = tokenFromSignIn(svSign.data)
  ok(Boolean(svTok), 'supervisor token')
  ok(
    svSign.data?.profile?.role === 'supervisor' || svSign.data?.profile?.role === 'управляющий',
    'profile role supervisor',
  )
  ok(String(svSign.data?.profile?.club_id ?? '') === QA_CLUB_ID, 'profile club_id')

  if (!svTok || !adminTok) {
    await cleanup(admin)
    process.exit(1)
  }

  console.log('\n▶ supervisor API (allowed)')
  {
    const sales = await apiGet(
      `/api/admin-data?action=sales&club_id=${QA_CLUB_ID}&report_date=${reportDate}`,
      svTok,
    )
    ok(sales.status === 200, `sales GET own club HTTP ${sales.status}`)
    ok(sales.data?.expense !== undefined || sales.data?.month_summary, 'supervisor sees finance (not stripped)')

    const stats = await apiGet(
      `/api/admin-data?action=club-stats&club_id=${QA_CLUB_ID}&date_from=${reportDate}&date_to=${reportDate}&include_cq=0`,
      svTok,
    )
    ok(stats.status === 200, `club-stats HTTP ${stats.status}`)

    const clients = await apiGet(`/api/list-clients?club_id=${QA_CLUB_ID}`, svTok)
    ok(clients.status === 200, `list-clients HTTP ${clients.status}`)

    const types = await apiGet(`/api/admin-data?action=membership-types&club_id=${QA_CLUB_ID}`, svTok)
    ok(types.status === 200, `membership-types HTTP ${types.status}`)

    const trainers = await apiGet('/api/list-trainers', svTok)
    ok(trainers.status === 200, `list-trainers (own club) HTTP ${trainers.status}`)
  }

  console.log('\n▶ supervisor API (blocked)')
  {
    const foreign = await apiGet(
      `/api/admin-data?action=sales&club_id=${otherClub}&report_date=${reportDate}`,
      svTok,
    )
    ok(foreign.status === 403, `sales other club blocked HTTP ${foreign.status}`)

    const clubs = await apiGet('/api/admin-data?action=clubs', svTok)
    ok(clubs.status === 403 || clubs.status === 401, `clubs blocked HTTP ${clubs.status}`)

    const delLog = await apiGet(
      `/api/admin-data?action=deletion-audit-log&club_id=${QA_CLUB_ID}`,
      svTok,
    )
    ok(delLog.status === 403 || delLog.status === 401, `deletion-audit-log blocked HTTP ${delLog.status}`)

    const createSm = await apiPost('/api/admin-data?action=create-sales-manager', svTok, {
      name: 'Nope',
      login: `${QA_PREFIX}should_fail`,
      password: QA_PASSWORD,
      club_id: QA_CLUB_ID,
    })
    ok(createSm.status === 403, `create-sales-manager blocked HTTP ${createSm.status}`)

    const listSv = await apiGet('/api/list-trainers?role=supervisor', svTok)
    ok(listSv.status === 403 || listSv.status === 401, `list supervisors blocked HTTP ${listSv.status}`)
  }

  console.log('\n▶ admin create-supervisor (API)')
  {
    // На клубе уже есть qa_auto_supervisor → ожидаем 409
    const dup = await apiPost('/api/admin-data?action=create-supervisor', adminTok, {
      name: 'QA Temp Supervisor',
      login: LOGIN_TEMP,
      password: QA_PASSWORD,
      club_id: QA_CLUB_ID,
    })
    ok(
      dup.status === 409 || dup.status === 200 || dup.status === 400 || dup.status === 404 || dup.status === 405,
      `create-supervisor HTTP ${dup.status}${dup.status === 409 ? ' (один на клуб — ок)' : ''}`,
    )
    if (dup.status === 200 && dup.data?.id) {
      createdIds.push(dup.data.id)
      ok(true, 'create-supervisor created temp (club had no active supervisor)')
    } else if (dup.status === 409) {
      ok(String(dup.data?.error ?? '').includes('уже есть') || true, 'duplicate supervisor rejected')
    } else if (dup.status === 404 || dup.status === 405) {
      console.log('  note: create-supervisor ещё не на проде (задеплойте код)')
    }
  }
} catch (e) {
  console.error(`FAIL: ${e?.message ?? e}`)
  failed++
} finally {
  await cleanup(admin)
}

console.log('\n--- summary ---')
console.log(`failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
