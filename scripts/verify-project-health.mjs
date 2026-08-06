/**
 * Мета-проверка здоровья репозитория: регистрация verify-скриптов, синтаксис API, размер бандла.
 * node scripts/verify-project-health.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const agentQaPath = join(root, 'scripts/agent-qa.mjs')
const MAX_MAIN_BUNDLE_KB = 2900

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function walkJs(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walkJs(p))
    else if (/\.(js|mjs)$/.test(name.name)) out.push(p)
  }
  return out
}

const verifyScripts = readdirSync(join(root, 'scripts'))
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort()

const agentQaSource = readFileSync(agentQaPath, 'utf8')

/** Скрипты, которые намеренно не в каждом qa:local (prod/credentials / browser). */
const optionalInLocalQa = new Set([
  'verify-prod-features.mjs',
  'verify-sales-manager-e2e.mjs',
  'verify-trainer-outreach-ui-browser.mjs',
])

const missingInAgentQa = verifyScripts.filter(
  (f) => !optionalInLocalQa.has(f) && !agentQaSource.includes(f.replace('.mjs', '')),
)

ok(verifyScripts.length >= 35, `verify scripts count (${verifyScripts.length})`)
ok(missingInAgentQa.length === 0, `all core verify scripts registered in agent-qa (${missingInAgentQa.join(', ') || 'none missing'})`)

let syntaxFailed = 0
for (const f of walkJs(join(root, 'api'))) {
  const r = spawnSync('node', ['--check', f], { stdio: 'pipe', shell: true })
  if (r.status !== 0) syntaxFailed++
}
ok(syntaxFailed === 0, `api syntax check (${syntaxFailed} errors)`)

const distIndex = join(root, 'dist/index.html')
ok(existsSync(distIndex), 'dist/index.html exists (run build via qa:local)')

if (existsSync(distIndex)) {
  const html = readFileSync(distIndex, 'utf8')
  const jsMatch = html.match(/\/assets\/(index-[^"']+\.js)/)
  ok(Boolean(jsMatch), 'dist index references main js bundle')
  if (jsMatch) {
    const bundlePath = join(root, 'dist/assets', jsMatch[1])
    ok(existsSync(bundlePath), 'main js bundle file exists')
    if (existsSync(bundlePath)) {
      const kb = Math.round(statSync(bundlePath).size / 1024)
      ok(kb < MAX_MAIN_BUNDLE_KB, `main bundle size ${kb} KB < ${MAX_MAIN_BUNDLE_KB} KB`)
    }
  }
  ok(html.includes('sw.js') || existsSync(join(root, 'dist/sw.js')), 'PWA service worker present')
}

const syncOrphansSrc = readFileSync(join(root, 'src/lib/syncQueueOrphans.js'), 'utf8')
const maxRetriesMatch = syncOrphansSrc.match(/SYNC_QUEUE_MAX_RETRIES\s*=\s*(\d+)/)
const maxRetries = maxRetriesMatch ? Number(maxRetriesMatch[1]) : 0
ok(maxRetries >= 8, `sync queue max retries (${maxRetries})`)

const localDbSrc = readFileSync(join(root, 'src/lib/localDb.js'), 'utf8')
ok(/DB_VERSION\s*=\s*16/.test(localDbSrc), 'indexeddb version 16 with sale_clips')
ok(localDbSrc.includes('sale_clips'), 'indexeddb sale_clips store')
ok(localDbSrc.includes('client_weight_entries'), 'indexeddb client_weight_entries store')
ok(localDbSrc.includes('by_trainer_id'), 'indexeddb by_trainer_id index')
ok(localDbSrc.includes('by_club_date'), 'indexeddb by_club_date compound index')
ok(localDbSrc.includes("createIndex('by_club_id', 'club_id'"), 'indexeddb challenges by_club_id index')

const criticalFiles = [
  'src/lib/syncService.js',
  'src/lib/appErrorJournal.js',
  'src/lib/localDbClubQuery.js',
  'src/components/AppErrorBoundary.jsx',
  'src/components/SectionErrorBoundary.jsx',
  'api/_lib/safeApiHandler.js',
]
for (const rel of criticalFiles) {
  ok(existsSync(join(root, rel)), `critical file ${rel}`)
}

if (failed) process.exit(1)
console.log('verify-project-health: all passed')
