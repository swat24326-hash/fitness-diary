/**
 * Где лежит список файлов, которые агент правил в текущем ответе, и как его читать.
 * Файл временный, в git не попадает (.gitignore).
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// CURSOR_HOOKS_STATE_FILE — только для тестов (scripts/verify-hooks.mjs),
// чтобы прогон проверок не забирал список правок у живого хука.
export const EDITED_FILES_LOG = process.env.CURSOR_HOOKS_STATE_FILE
  ? resolve(process.env.CURSOR_HOOKS_STATE_FILE)
  : fileURLToPath(new URL('../.state/edited-files.log', import.meta.url))

/** Читает список и сразу очищает его: каждый ответ агента проверяем только раз. */
export function takeEditedFiles() {
  if (!existsSync(EDITED_FILES_LOG)) return []

  let raw = ''
  try {
    raw = readFileSync(EDITED_FILES_LOG, 'utf8')
  } catch {
    return []
  }
  try {
    rmSync(EDITED_FILES_LOG, { force: true })
  } catch {
    // не критично: следующий запуск перечитает тот же список
  }

  return [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}
