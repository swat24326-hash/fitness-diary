import { salesStrategyHelpLines } from '../src/lib/admin/salesStrategyHelpCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const lines = salesStrategyHelpLines({ planExtraPct: 70, budgetTolerance: 15000 })
ok(Array.isArray(lines) && lines.length >= 6, `lines count ${lines.length}`)
ok(lines.every((l) => typeof l === 'string' && l.trim()), 'all non-empty strings')
ok(lines.some((l) => /Посчитать/i.test(l)), 'mentions calculate')
ok(lines.some((l) => /План месяца/i.test(l)), 'mentions plan month')
ok(lines.some((l) => /Playbook|прогресс/i.test(l)), 'mentions playbook')
ok(lines.some((l) => /ур\.?\s*3|Ур\.?\s*3/i.test(l)), 'mentions level 3')
ok(lines.some((l) => /15[\s\u00a0]?000|15000/.test(l)), 'mentions tolerance')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales strategy help checks passed')
