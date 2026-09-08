/**
 * node scripts/verify-qa-fast.mjs
 * Быстрый режим проверок: связь «изменённый файл → нужные verify» и когда нужен полный прогон.
 */
import {
  buildVerifyIndex,
  collectImports,
  planFastQa,
  resolveImportPath,
} from './lib/qaFastPlan.mjs'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

/* Путь импорта считаем без диска: иначе тест зависел бы от реального дерева файлов. */
ok(
  resolveImportPath('scripts/verify-x.mjs', '../src/lib/a.js') === 'src/lib/a.js',
  'подъём на уровень выше',
)
ok(
  resolveImportPath('src/lib/a.js', './b.js') === 'src/lib/b.js',
  'сосед в той же папке',
)
ok(resolveImportPath('scripts/verify-x.mjs', 'node:fs') === null, 'системный модуль пропускаем')
ok(resolveImportPath('scripts/verify-x.mjs', 'minimatch') === null, 'пакет пропускаем')

const text = `
import { a } from '../src/lib/a.js'
import b from 'node:fs'
export { c } from './helper.js'
const lazy = await import('../src/lib/lazy.js')
`
/* Многострочный импорт — основной стиль в проекте; на нём режим один раз уже слепнул. */
const multiline = `
import {
  first,
  second,
} from '../src/lib/multi.js'
import './styles.css'
`
const multilineImports = collectImports(multiline, 'scripts/verify-x.mjs')
ok(multilineImports.includes('src/lib/multi.js'), 'многострочный импорт найден')
ok(multilineImports.includes('scripts/styles.css'), 'импорт-побочный эффект найден')

const imports = collectImports(text, 'scripts/verify-x.mjs')
ok(imports.includes('src/lib/a.js'), 'обычный импорт найден')
ok(imports.includes('scripts/helper.js'), 'реэкспорт найден')
ok(imports.includes('src/lib/lazy.js'), 'динамический импорт найден')
ok(!imports.some((p) => p.includes('node:')), 'системные не попали')

/* Фальшивое дерево: verify → сервис → чистое ядро. Изменили ядро — тест должен найтись. */
const files = {
  'scripts/verify-alpha.mjs': `import { run } from '../src/lib/alphaService.js'`,
  'src/lib/alphaService.js': `import { rule } from './alphaCore.js'`,
  'src/lib/alphaCore.js': `export const rule = 1`,
  'scripts/verify-beta.mjs': `import { b } from '../src/lib/betaCore.js'`,
  'src/lib/betaCore.js': `export const b = 2`,
}
const readFile = (p) => files[p] ?? null
const exists = (p) => Object.hasOwn(files, p)
const index = buildVerifyIndex({
  verifyFiles: ['scripts/verify-alpha.mjs', 'scripts/verify-beta.mjs'],
  readFile,
  exists,
})

ok(
  index.get('src/lib/alphaCore.js')?.includes('scripts/verify-alpha.mjs') === true,
  'ядро через сервис связано с verify (транзитивно)',
)
ok(
  index.get('src/lib/betaCore.js')?.includes('scripts/verify-alpha.mjs') !== true,
  'чужой тест не подтягивается',
)

const plan = planFastQa({ changedFiles: ['src/lib/alphaCore.js'], index })
ok(plan.verifies.length === 1 && plan.verifies[0] === 'scripts/verify-alpha.mjs', 'план: один тест')
ok(plan.lint.includes('src/lib/alphaCore.js'), 'план: файл идёт в lint')
ok(plan.needsFull === false, 'план: сборка не нужна')
ok(plan.uncovered.length === 0, 'план: покрытый файл не числится пробелом')

const docsPlan = planFastQa({ changedFiles: ['docs/SYNC.md', 'src/styles/pnk.css'], index })
ok(docsPlan.verifies.length === 0 && docsPlan.uncovered.length === 0, 'докам и стилям тесты не нужны')

const uncoveredPlan = planFastQa({ changedFiles: ['src/lib/newThing.js'], index })
ok(uncoveredPlan.uncovered.includes('src/lib/newThing.js'), 'файл без теста виден в отчёте')

const buildPlan = planFastQa({ changedFiles: ['package.json'], index })
ok(buildPlan.needsFull === true, 'правка package.json требует полного прогона')
ok(/build/.test(buildPlan.fullReasons[0].reason), 'причина названа человеку')

const selfPlan = planFastQa({ changedFiles: ['scripts/verify-beta.mjs'], index })
ok(selfPlan.verifies.includes('scripts/verify-beta.mjs'), 'правку самого теста прогоняем')

/* Windows отдаёт пути с обратными слешами — иначе связь не нашлась бы. */
const winPlan = planFastQa({ changedFiles: ['src\\lib\\alphaCore.js'], index })
ok(winPlan.verifies.includes('scripts/verify-alpha.mjs'), 'путь с обратными слешами понят')

if (failed > 0) {
  console.error(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-qa-fast: все проверки прошли')
