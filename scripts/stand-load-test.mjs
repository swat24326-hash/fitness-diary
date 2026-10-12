/**
 * Нагрузочный тест на стенде (docs/CAPACITY_PLAN.md, этап B). Только чтение: полный trainer-pull (как ручной Sync
 * после выкатки) и GET /api/client-me, ступенями «N разом». Ступень сломалась (> 1% ошибок) — дальше по этой линии не идём.
 * Генератор на той же ВМ: тело не разбираем, только считаем байты; его долю CPU печатаем отдельно.
 *
 * Usage (на стенде): sudo -u osapp node scripts/stand-load-test.mjs /tmp/load-tokens.json [http://127.0.0.1:8080]
 */
import { readFileSync } from 'node:fs'
import { formatLoadStep, loadStepVerdict, summarizeLoadStep } from '../src/lib/loadTest/loadStatsCore.js'

const [tokensFile, baseArg] = process.argv.slice(2)
const BASE = (baseArg || 'http://127.0.0.1:8080').replace(/\/$/, '')
const { trainers, clients } = JSON.parse(readFileSync(tokensFile, 'utf8'))
const PAUSE_MS = 5000

const PULL_STEPS = [10, 50, 100, 200, 400]
const ME_STEPS = [50, 200, 500, 1000]
const MIXED = { pulls: 100, me: 500 }

function cpuTimes() {
  const [, ...nums] = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/)
  const v = nums.map(Number)
  return { idle: v[3] + v[4], total: v.reduce((a, b) => a + b, 0) }
}

async function hit(path, token) {
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(90_000) })
    let bytes = 0
    for await (const chunk of res.body) bytes += chunk.length
    return { ms: performance.now() - t0, status: res.status, bytes }
  } catch {
    return { ms: performance.now() - t0, status: 0, bytes: 0 }
  }
}

const pull = (i) => hit('/api/trainer-pull', trainers[i % trainers.length])
const me = (i) => hit('/api/client-me', clients[i % clients.length])

async function step(label, jobs) {
  const cpu0 = cpuTimes()
  const own0 = process.cpuUsage()
  const t0 = performance.now()
  const results = await Promise.all(jobs.map((job) => job()))
  const wallMs = performance.now() - t0
  const cpu1 = cpuTimes()
  const own = process.cpuUsage(own0)
  const busy = 1 - (cpu1.idle - cpu0.idle) / Math.max(1, cpu1.total - cpu0.total)
  const genShare = (own.user + own.system) / 1000 / wallMs / 2
  const byKind = {}
  for (const [i, r] of results.entries()) (byKind[jobs[i].kind] ??= []).push(r)
  const out = {}
  for (const [kind, rs] of Object.entries(byKind)) {
    out[kind] = summarizeLoadStep(rs, wallMs)
    console.log(formatLoadStep(`${label} ${kind}`, out[kind]))
  }
  console.log(`  CPU стенда ${Math.round(busy * 100)}% (из них генератор ~${Math.round(genShare * 100)}%)`)
  await new Promise((r) => setTimeout(r, PAUSE_MS))
  return out
}

const tag = (kind, fn) => Object.assign(fn, { kind })
const report = { pull: [], me: [], mixed: null }

console.log(`стенд ${BASE}: тренеров ${trainers.length}, клиентов ${clients.length}`)
await step('прогрев', [tag('pull', () => pull(0)), tag('me', () => me(0))])

for (const n of PULL_STEPS) {
  const s = (await step(`Sync тренеров`, Array.from({ length: n }, (_, i) => tag('pull', () => pull(i))))).pull
  report.pull.push({ n, ...s, verdict: loadStepVerdict(s) })
  if (loadStepVerdict(s) === 'broken') break
}
for (const n of ME_STEPS) {
  const s = (await step(`/me клиентов`, Array.from({ length: n }, (_, i) => tag('me', () => me(i))))).me
  report.me.push({ n, ...s, verdict: loadStepVerdict(s) })
  if (loadStepVerdict(s) === 'broken') break
}
report.mixed = await step(`вечерний пик ${MIXED.pulls}+${MIXED.me}`, [
  ...Array.from({ length: MIXED.pulls }, (_, i) => tag('pull', () => pull(i))),
  ...Array.from({ length: MIXED.me }, (_, i) => tag('me', () => me(i))),
])
console.log(`ИТОГ ${JSON.stringify(report)}`)
