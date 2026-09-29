/**
 * Поиск пользователя по email/логину — точное совпадение без учёта регистра.
 * `%` `_` в ILIKE — шаблоны: без экранирования `a_min@x` находил профиль `admin@x`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ilikeExactPattern } from '../src/lib/ilikeExactCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

/** Семантика Postgres ILIKE с escape `\` по умолчанию. */
function pgIlike(value, pattern) {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is').test(value)
}

const match = (value, input) => {
  const p = ilikeExactPattern(input)
  return p != null && pgIlike(value, p)
}

console.log('ilikeExactPattern')
ok(!match('admin@fit-city.ru', 'a_min@fit-city.ru'), '`_` не подменяет символ (эскалация через похожий email)')
ok(!match('admin@fit-city.ru', '%@fit-city.ru'), '`%` не подменяет строку')
ok(match('a\\min@x.ru', 'a\\min@x.ru') && !match('amin@x.ru', 'a\\min@x.ru'), 'обратный слэш — литерал')
ok(match('Admin@Fit-City.ru', 'admin@fit-city.ru'), 'регистр не важен')
ok(match('qa_auto_admin', 'QA_AUTO_ADMIN'), 'логин с `_` находится точно')
ok(match('a%b@x.ru', 'a%b@x.ru') && !match('axxb@x.ru', 'a%b@x.ru'), '`%` в значении — литерал')
ok(ilikeExactPattern('a*@x.ru') === null, '`*` (PostgREST → %) — не искать')
ok(ilikeExactPattern('   ') === null && ilikeExactPattern(null) === null, 'пустое — не искать')
ok(ilikeExactPattern('  Ivan@x.ru ') === 'Ivan@x.ru', 'обрезает пробелы')

console.log('call sites')
const decodedRoot = fileURLToPath(new URL('..', import.meta.url))
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(m?js|jsx)$/.test(name)) out.push(p)
  }
  return out
}
const bad = []
let sites = 0
for (const f of [...walk(join(decodedRoot, 'api')), ...walk(join(decodedRoot, 'src'))]) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\.ilike\(\s*['"](email|login)['"]\s*,\s*([^)]+)\)/g)) {
    sites++
    if (!/^\w*(Pattern|Pat)$/.test(m[2].trim())) bad.push(`${relative(decodedRoot, f)}: ilike('${m[1]}', ${m[2].trim()})`)
  }
}
ok(sites >= 8, `найдены места поиска по email/логину (${sites})`)
ok(bad.length === 0, `все идут через ilikeExactPattern${bad.length ? `:\n    ${bad.join('\n    ')}` : ''}`)

if (failed) {
  console.error(`\nverify-ilike-exact: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-ilike-exact: ok')
