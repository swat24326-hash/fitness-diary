/**
 * Максимальная автопроверка: agent-qa + API syntax + целостность dist + сверка с продом.
 * node scripts/deep-qa.mjs [--skip-prod]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.env.QA_ORIGIN ?? 'https://fitness-diary-bice.vercel.app'
const skipProd = process.argv.includes('--skip-prod')
const root = fileURLToPath(new URL('..', import.meta.url))

let failed = 0

function fail(label) {
  console.error(`✗ ${label}`)
  failed++
}

function ok(label) {
  console.log(`✓ ${label}`)
}

function check(cond, label) {
  if (cond) ok(label)
  else fail(label)
}

function run(label, cmd, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root })
  if (r.status !== 0) {
    fail(label)
    return false
  }
  ok(label)
  return true
}

// 1) Полный agent-qa (build, unit scripts, lint, prod smoke)
const qaArgs = ['scripts/agent-qa.mjs']
if (skipProd) qaArgs.push('--skip-prod')
run('agent-qa', 'node', qaArgs)

// 2) Синтаксис API и scripts
console.log('\n▶ api/scripts syntax')
for (const dir of ['api', 'scripts']) {
  const base = join(root, dir)
  if (!existsSync(base)) continue
  for (const f of walkJs(base)) {
    const r = spawnSync('node', ['--check', f], { stdio: 'pipe', shell: true })
    if (r.status !== 0) {
      fail(`syntax ${f}`)
      if (r.stderr?.length) console.error(r.stderr.toString())
    }
  }
}
if (failed === 0) ok('api/scripts syntax')

function walkJs(dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walkJs(p))
    else if (/\.(js|mjs)$/.test(name.name)) out.push(p)
  }
  return out
}

// 3) dist: index.html ссылается на существующие assets
console.log('\n▶ dist integrity')
const indexPath = join(root, 'dist/index.html')
if (!existsSync(indexPath)) {
  fail('dist/index.html missing (run build first)')
} else {
  const html = readFileSync(indexPath, 'utf8')
  const assets = [...html.matchAll(/\/assets\/([^"'\s]+)/g)].map((m) => m[1])
  check(assets.length > 0, 'dist/index.html lists assets')
  for (const a of new Set(assets)) {
    check(existsSync(join(root, 'dist/assets', a)), `dist/assets/${a}`)
  }
}

// 4) Маркеры свежей сборки в локальном dist
console.log('\n▶ dist feature markers')
const distCss = readdirSync(join(root, 'dist/assets')).find((f) => /^index-.*\.css$/.test(f))
const distJs = readdirSync(join(root, 'dist/assets')).find((f) => /^index-.*\.js$/.test(f) && !f.includes('legacy'))
if (distCss && distJs) {
  const css = readFileSync(join(root, 'dist/assets', distCss), 'utf8')
  const js = readFileSync(join(root, 'dist/assets', distJs), 'utf8')
  const markers = [
    ['stopwatch CSS', 'app-header__stopwatch', css],
    ['sync flush UX', 'очередь отправлена', js],
    ['admin club select', 'Выберите клуб', js],
    ['no stale filter', 'Все клубы', js, true],
  ]
  for (const [name, needle, hay, invert] of markers) {
    const has = hay.includes(needle)
    check(invert ? !has : has, `dist ${name}`)
  }
} else {
  fail('dist index css/js bundles')
}

// 5) Прод: те же маркеры + доп. проверки
if (!skipProd) {
  console.log('\n▶ prod deep bundle')
  try {
    const home = await fetch(`${ORIGIN}/`)
    check(home.status === 200, `GET ${ORIGIN}/`)
    const html = await home.text()
    const jsM = html.match(/\/assets\/(index-[^"]+\.js)/)
    const cssM = html.match(/\/assets\/(index-[^"]+\.css)/)
    check(Boolean(jsM), 'prod index.js hash')
    check(Boolean(cssM), 'prod index.css hash')
    if (jsM && cssM) {
      const [js, css] = await Promise.all([
        fetch(`${ORIGIN}/assets/${jsM[1]}`).then((r) => r.text()),
        fetch(`${ORIGIN}/assets/${cssM[1]}`).then((r) => r.text()),
      ])
      console.log(`  prod js: ${jsM[1]}`)
      console.log(`  prod css: ${cssM[1]}`)
      check(css.includes('app-header__stopwatch'), 'prod stopwatch CSS')
      check(js.includes('очередь отправлена') || js.includes('в очереди:'), 'prod sync UX strings')
      check(js.includes('Выберите клуб'), 'prod admin UI')
      check(!js.includes('Все клубы'), 'prod no stale "Все клубы"')
      check(js.includes('app-header__sync-btn'), 'prod header sync')
      check(js.includes('Быстрая загрузка'), 'prod bulk upload')
      if (distJs && jsM[1] !== distJs) {
        console.log(`  note: prod js (${jsM[1]}) ≠ local dist (${distJs}) — redeploy if commit is on main`)
      }
    }

    const apiExtra = [
      ['GET auth-sign-in', `${ORIGIN}/api/auth-sign-in`, 'GET', 405],
      ['POST auth-sign-in empty', `${ORIGIN}/api/auth-sign-in`, 'POST', 400],
      ['GET me-profile', `${ORIGIN}/api/me-profile`, 'GET', 401],
      ['GET create-trainer', `${ORIGIN}/api/create-trainer`, 'GET', 405],
    ]
    for (const [name, url, method, expected] of apiExtra) {
      const r = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
      })
      check(r.status === expected, `${name} → ${r.status} (expected ${expected})`)
    }
  } catch (e) {
    fail(`prod deep: ${e.message}`)
  }
}

if (failed) {
  console.error(`\n${failed} deep QA check(s) failed`)
  process.exit(1)
}
console.log('\nAll deep QA checks passed.')
