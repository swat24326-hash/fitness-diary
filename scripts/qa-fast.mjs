/**
 * Быстрый прогон по изменённым файлам: lint + только относящиеся verify. Без build.
 *
 * node scripts/qa-fast.mjs            — изменения против HEAD (незакоммиченные)
 * node scripts/qa-fast.mjs --base=X   — изменения против коммита/ветки X
 * node scripts/qa-fast.mjs --plan     — только показать план, ничего не запускать
 *
 * Это режим для итераций. Перед деплоем на критическом пути (sync, абонемент,
 * «Закончить», статистика) остаётся `npm run qa:local` — он включает сборку.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { buildVerifyIndex, planFastQa } from './lib/qaFastPlan.mjs'

const baseArg = process.argv.find((a) => a.startsWith('--base='))
const planOnly = process.argv.includes('--plan')

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

function changedFiles() {
  if (baseArg) {
    const base = baseArg.slice('--base='.length)
    return git(['diff', '--name-only', `${base}...HEAD`]).split('\n')
  }
  const tracked = git(['diff', '--name-only', 'HEAD']).split('\n')
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n')
  return [...tracked, ...untracked]
}

const readFile = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const changed = changedFiles()
  .map((s) => s.trim())
  .filter(Boolean)

if (!changed.length) {
  console.log('Изменений против HEAD нет — проверять нечего.')
  process.exitCode = 0
} else {
  const verifyFiles = globSync('scripts/verify-*.mjs').map((p) => p.replace(/\\/g, '/'))
  const index = buildVerifyIndex({ verifyFiles, readFile, exists: existsSync })
  const plan = planFastQa({ changedFiles: changed, index })

  console.log(`Изменённых файлов: ${changed.length}`)
  console.log(`Тестов по этим файлам: ${plan.verifies.length} из ${verifyFiles.length}`)
  if (plan.uncovered.length) {
    console.log(`\nБез своего теста (стоит завести verify, если есть ветвления):`)
    for (const file of plan.uncovered) console.log(`  ${file}`)
  }
  if (plan.needsFull) {
    console.log('\nНужен полный прогон:')
    for (const { file, reason } of plan.fullReasons) console.log(`  ${file} — ${reason}`)
  }

  if (planOnly) {
    console.log('\n--plan: ничего не запускал.')
  } else {
    let failed = 0

    if (plan.lint.length) {
      console.log(`\n▶ lint (${plan.lint.length} файлов)`)
      const r = spawnSync('npx', ['eslint', '--no-ignore', ...plan.lint], {
        stdio: 'inherit',
        shell: true,
      })
      if (r.status !== 0) {
        console.error('✗ lint')
        failed++
      } else console.log('✓ lint')
    }

    for (const verify of plan.verifies) {
      const r = spawnSync('node', [verify], { stdio: 'inherit', shell: true })
      if (r.status !== 0) {
        console.error(`✗ ${verify}`)
        failed++
      } else console.log(`✓ ${verify}`)
    }

    if (failed) {
      console.error(`\n${failed} проверок не прошло`)
      process.exitCode = 1
    } else {
      console.log('\nБыстрый прогон: всё зелёное.')
      if (plan.needsFull) console.log('Но перед деплоем нужен npm run qa:local (см. выше).')
      process.exitCode = 0
    }
  }
}
