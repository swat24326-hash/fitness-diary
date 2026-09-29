/**
 * Пароль QA-учёток (qa_auto_admin на проде) не лежит в репо:
 * из env QA_PASSWORD или случайный на каждый запуск.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.m?js$/.test(name)) out.push(p)
  }
  return out
}

const LITERAL = /\b\w*PASSWORD\w*\s*(=|\?\?|\|\|)\s*['"`][^'"`\s$]{6,}['"`]/
const hits = []
for (const f of walk(join(root, 'scripts'))) {
  const src = readFileSync(f, 'utf8')
  src.split('\n').forEach((line, i) => {
    if (LITERAL.test(line) && !/ваш_пароль|пароль"/.test(line)) hits.push(`${relative(root, f)}:${i + 1}`)
  })
}
ok(hits.length === 0, `нет литерала пароля в scripts/${hits.length ? `: ${hits.join(', ')}` : ''}`)

const read = (env) =>
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./scripts/lib/qaSupabaseAdmin.mjs').then(m => process.stdout.write(String(m.QA_PASSWORD.length) + ':' + m.QA_PASSWORD.slice(-4)))"],
    { cwd: root, env: { ...process.env, QA_PASSWORD: '', ...env }, encoding: 'utf8' },
  )
const a = read({})
const b = read({})
ok(Number(a.split(':')[0]) >= 16, 'случайный пароль достаточной длины')
ok(a !== b, 'без env пароль разный на каждый запуск')
ok(read({ QA_PASSWORD: 'from-env-value-1234' }) === '19:1234', 'QA_PASSWORD из env имеет приоритет')

if (failed) {
  console.error(`\nverify-qa-password-not-hardcoded: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-qa-password-not-hardcoded: ok')
