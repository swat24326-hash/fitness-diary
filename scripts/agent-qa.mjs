/**
 * Автопроверка для агента/CI: build, форматы упражнений, lint, prod smoke.
 * node scripts/agent-qa.mjs [--skip-prod] [--skip-prod-roles] [--skip-lint]
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const ORIGIN = process.env.QA_ORIGIN ?? 'https://fitness-diary-bice.vercel.app'
const skipProd = process.argv.includes('--skip-prod')
const skipProdRoles = process.argv.includes('--skip-prod-roles')
const skipLint = process.argv.includes('--skip-lint')

let failed = 0

function run(label, cmd, args, opts = {}) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts })
  if (r.status !== 0) {
    console.error(`✗ ${label}`)
    failed++
  } else {
    console.log(`✓ ${label}`)
  }
}

function check(cond, label) {
  if (cond) {
    console.log(`✓ ${label}`)
  } else {
    console.error(`✗ ${label}`)
    failed++
  }
}

run('build', 'npm', ['run', 'build'])
run('exercise formats', 'node', ['scripts/verify-exercise-format.mjs'])
run('sync offline-first', 'node', ['scripts/verify-sync-offline.mjs'])
run('network reachability', 'node', ['scripts/verify-network-reachability.mjs'])
run('auth sign-in fallback', 'node', ['scripts/verify-auth-sign-in-fallback.mjs'])
run('sync unsynced re-queue', 'node', ['scripts/verify-sync-unsynced.mjs'])
run('client trainings prune', 'node', ['scripts/verify-client-trainings-prune.mjs'])
run('bulk exercises parser', 'node', ['scripts/verify-bulk-exercises.mjs'])
run('client birthdays', 'node', ['scripts/verify-client-birthdays.mjs'])
run('membership type stats', 'node', ['scripts/verify-membership-type-stats.mjs'])
run('membership types pull', 'node', ['scripts/verify-membership-types-pull.mjs'])
run('membership types merge', 'node', ['scripts/verify-membership-types-merge.mjs'])
run('club client period', 'node', ['scripts/verify-club-client-period.mjs'])
run('club monthly year', 'node', ['scripts/verify-club-monthly-year.mjs'])
run('club sales profit', 'node', ['scripts/verify-club-sales-profit.mjs'])
run('club finance forecast', 'node', ['scripts/verify-club-finance-forecast.mjs'])
run('trainer payroll', 'node', ['scripts/verify-trainer-payroll.mjs'])
run('trainer auth admin', 'node', ['scripts/verify-trainer-auth-admin.mjs'])
run('aerobic payroll', 'node', ['scripts/verify-aerobic-payroll.mjs'])
run('sales plan progress', 'node', ['scripts/verify-sales-plan-progress.mjs'])
run('sales plan levels', 'node', ['scripts/verify-sales-plan-levels.mjs'])
run('sales manager stats', 'node', ['scripts/verify-sales-manager-stats.mjs'])
run('sales manager role', 'node', ['scripts/verify-sales-manager-role.mjs'])
run('sales draft storage', 'node', ['scripts/verify-admin-sales-draft.mjs'])
run('club month analytics', 'node', ['scripts/verify-club-month-analytics.mjs'])
run('gemini analytics', 'node', ['scripts/verify-gemini-analytics.mjs'])
run('iskra quick chips', 'node', ['scripts/verify-iskra-quick-chips.mjs'])
run('iskra data availability', 'node', ['scripts/verify-iskra-data-availability.mjs'])
run('gemini trainer contour', 'node', ['scripts/verify-gemini-trainer-contour.mjs'])
run('iskra trainer routing', 'node', ['scripts/verify-iskra-trainer-routing.mjs'])
run('stats agg parity', 'node', ['scripts/verify-stats-agg-parity.mjs'])
run('challenge max reps', 'node', ['scripts/verify-challenge-max-reps.mjs'])
run('membership stats refresh', 'node', ['scripts/verify-membership-stats-refresh.mjs'])
run('training superset', 'node', ['scripts/verify-training-superset.mjs'])
run('last exercise result', 'node', ['scripts/verify-last-exercise-result.mjs'])
run('app diagnostics', 'node', ['scripts/verify-app-diagnostics.mjs'])
run('app error journal', 'node', ['scripts/verify-app-error-journal.mjs'])
run('project health', 'node', ['scripts/verify-project-health.mjs'])
run('local db club query', 'node', ['scripts/verify-local-db-club-query.mjs'])
run('trainer pull incremental', 'node', ['scripts/verify-trainer-pull-incremental.mjs'])
run('club monthly years bounds', 'node', ['scripts/verify-club-monthly-years-bounds.mjs'])
run('idb retention', 'node', ['scripts/verify-idb-retention.mjs'])
run('draft trainings query', 'node', ['scripts/verify-draft-trainings-query.mjs'])
run('challenges club query', 'node', ['scripts/verify-challenges-club-query.mjs'])
run('client counts local', 'node', ['scripts/verify-client-counts-local.mjs'])
run('trainer attention summary', 'node', ['scripts/verify-trainer-attention-summary.mjs'])
run('admin club day summary', 'node', ['scripts/verify-admin-club-day-summary.mjs'])
run('admin client quick filters', 'node', ['scripts/verify-admin-client-quick-filters.mjs'])
run('nutrition plan', 'node', ['scripts/verify-nutrition-plan.mjs'])
run('client weight', 'node', ['scripts/verify-client-weight.mjs'])
run('health card', 'node', ['scripts/verify-health-card.mjs'])
run('nutrition products', 'node', ['scripts/verify-nutrition-products.mjs'])
run('sync outbound label', 'node', ['scripts/verify-sync-outbound-label.mjs'])

if (!skipLint) {
  run('lint', 'npm', ['run', 'lint'])
}

if (!skipProd) {
  console.log('\n▶ prod smoke')
  try {
    const home = await fetch(`${ORIGIN}/`)
    check(home.status === 200, `GET / → ${home.status}`)

    const apiChecks = [
      ['GET trainer-pull', `${ORIGIN}/api/trainer-pull`, 'GET', 401],
      ['POST trainer-pull', `${ORIGIN}/api/trainer-pull`, 'POST', 405],
      ['GET list-trainers', `${ORIGIN}/api/list-trainers`, 'GET', 401],
      ['GET admin-data', `${ORIGIN}/api/admin-data?action=clubs`, 'GET', 401],
      ['POST push-record', `${ORIGIN}/api/push-record`, 'POST', 401],
      ['POST push-records', `${ORIGIN}/api/push-records`, 'POST', 401],
    ]

    for (const [name, url, method, expected] of apiChecks) {
      const r = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
      })
      check(r.status === expected, `${name} → ${r.status} (expected ${expected})`)
    }

    const html = await fetch(`${ORIGIN}/`).then((r) => r.text())
    const m = html.match(/\/assets\/(index-[^"]+\.js)/)
    check(Boolean(m), 'prod bundle hash in index.html')
    const cssM = html.match(/\/assets\/(index-[^"]+\.css)/)
    if (m) {
      const js = await fetch(`${ORIGIN}/assets/${m[1]}`).then((r) => r.text())
      check(js.includes('Выберите клуб'), 'prod bundle has current admin UI string')
      check(!js.includes('Все клубы'), 'prod bundle has no stale "Все клубы" string')
      check(js.includes('очередь отправлена') || js.includes('в очереди:'), 'prod sync feedback strings')
    }
    if (cssM) {
      const css = await fetch(`${ORIGIN}/assets/${cssM[1]}`).then((r) => r.text())
      check(css.includes('app-header__stopwatch'), 'prod bundle has header stopwatch styles')
    }

    if (!skipProdRoles) {
      run('prod roles API', 'node', ['scripts/qa-roles-prod.mjs', '--keep-users'])
      run('sales manager e2e', 'node', ['scripts/verify-sales-manager-e2e.mjs'])
      run('cleanup QA users', 'node', ['scripts/qa-roles-cleanup.mjs'])
    }
    run('prod features', 'node', ['scripts/verify-prod-features.mjs'])
  } catch (e) {
    console.error('✗ prod smoke:', e.message)
    failed++
  }
}

console.log('\n▶ static checks')
check(existsSync('dist/index.html'), 'dist/index.html exists')
check(existsSync('dist/sw.js'), 'dist/sw.js exists')

if (failed) {
  console.error(`\n${failed} check group(s) failed`)
  process.exit(1)
}
console.log('\nAll agent QA checks passed.')
