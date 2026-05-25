/**
 * Автопроверка для агента/CI: build, форматы упражнений, lint, prod smoke.
 * node scripts/agent-qa.mjs [--skip-prod] [--skip-lint]
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const ORIGIN = process.env.QA_ORIGIN ?? 'https://fitness-diary-bice.vercel.app'
const skipProd = process.argv.includes('--skip-prod')
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
run('bulk exercises parser', 'node', ['scripts/verify-bulk-exercises.mjs'])

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
    if (m) {
      const js = await fetch(`${ORIGIN}/assets/${m[1]}`).then((r) => r.text())
      check(js.includes('Выберите клуб'), 'prod bundle has current admin UI string')
      check(!js.includes('Все клубы'), 'prod bundle has no stale "Все клубы" string')
    }
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
