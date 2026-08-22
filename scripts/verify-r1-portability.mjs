/**
 * R1 hygiene: критический путь UI/API без хардкода текущего prod-хоста.
 * Docs/QA-дефолты с vercel.app — ок до cutover (STRATEGY §5.4.1).
 * node scripts/verify-r1-portability.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const FORBIDDEN = /fitness-diary-bice\.vercel\.app/i
const SCAN_DIRS = ['src', 'api']
const EXT = /\.(js|jsx|mjs|cjs|ts|tsx)$/

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

const hits = []
for (const d of SCAN_DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const text = readFileSync(file, 'utf8')
    if (FORBIDDEN.test(text)) hits.push(relative(ROOT, file).replace(/\\/g, '/'))
  }
}

ok(hits.length === 0, hits.length ? `no prod URL in src/api (found: ${hits.join(', ')})` : 'no prod URL in src/api')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-r1-portability: all ok')
