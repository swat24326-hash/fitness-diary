/**
 * Хук stop: в конце ответа агента проверяем то, что он реально правил.
 *
 * 1. eslint по изменённым js/jsx/mjs — ошибки не должны уезжать в прод.
 * 2. Напоминание про qa:critical, если тронут критический путь (sync, абонементы, agg).
 *
 * Возвращаем followup_message только когда есть что исправлять, иначе молчим.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { runHook } from './lib/hookIo.mjs'
import { PROJECT_ROOT, takeEditedFiles } from './lib/editedFiles.mjs'
import { filterLintable, criticalZones, parseEslintErrors } from './lib/stopCheckRules.mjs'

const ESLINT_BIN = join(PROJECT_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js')
const MAX_REPORTED = 12

function lintErrors(files) {
  if (files.length === 0 || !existsSync(ESLINT_BIN)) return []

  // --no-ignore: иначе eslint молча пропускает файлы в папках с точкой (.cursor/hooks).
  // Лишние каталоги уже отсеяны filterLintable.
  const run = spawnSync(process.execPath, [ESLINT_BIN, '--no-ignore', '--format', 'json', ...files], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return parseEslintErrors(run.stdout)
}

runHook((input) => {
  // Ответ прерван или упал — список правок не забираем, проверим его в следующий раз.
  if (input.status !== 'completed') return {}

  const edited = takeEditedFiles()
  if (Number(input.loop_count || 0) >= 2) return {}

  const lintable = filterLintable(edited).filter((path) => existsSync(path))
  const errors = lintErrors(lintable)
  const zones = criticalZones(edited)
  const lines = []

  if (errors.length > 0) {
    lines.push(
      `Хук проекта: eslint нашёл ошибки (${errors.length}) в файлах, которые ты только что правил:`,
      ...errors.slice(0, MAX_REPORTED),
      errors.length > MAX_REPORTED ? `…и ещё ${errors.length - MAX_REPORTED}.` : '',
      'Исправь причину, не отключай правило. Затронутые файлы: ' + lintable.join(', ')
    )
  }

  if (zones.length > 0 && Number(input.loop_count || 0) === 0) {
    lines.push(
      `Хук проекта: тронут критический путь (${zones.join(', ')}).`,
      'По fitness-diary-ship нужен npm run qa:critical или узкий verify-*.mjs — прогони и покажи результат.'
    )
  }

  const followup = lines.filter(Boolean).join('\n')
  return followup ? { followup_message: followup } : {}
})
