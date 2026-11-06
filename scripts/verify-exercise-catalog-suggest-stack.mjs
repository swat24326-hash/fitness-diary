/**
 * Подсказки упражнений не должны уходить под «Закончить тренировку».
 * node scripts/verify-exercise-catalog-suggest-stack.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const form = readFileSync(join(root, 'src/components/TrainingForm.jsx'), 'utf8')

ok(form.includes('training-form--suggest-open'), 'jsx: form root class when suggest open')
ok(form.includes('exercise-catalog-combo--open'), 'jsx: open class on combo')
ok(/\.training-form--suggest-open\s*\{[^}]*z-index:\s*40/s.test(css), 'css: form stacking above actions')
ok(/\.training-actions-row\s*\{[^}]*z-index:\s*1/s.test(css), 'css: actions row z-index 1')
ok(
  /body:has\(\.training-form--suggest-open\)\s+\.training-actions-row\s*\{[^}]*pointer-events:\s*none/s.test(css),
  'css: actions row ignores pointer while suggest open',
)
ok(
  /\.exercise-catalog-suggest\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--bg-elevated\)/s.test(css),
  'css: suggest uses elevated glass (not solid fill)',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll exercise catalog suggest stack checks passed')
