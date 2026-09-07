/**
 * Хук afterFileEdit: запоминаем, какие файлы правил агент.
 * Список читает stop-check.mjs, чтобы линтовать только эти файлы, а не весь репозиторий.
 * Ничего тяжёлого здесь делать нельзя — хук срабатывает на каждую правку.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { runHook } from './lib/hookIo.mjs'
import { EDITED_FILES_LOG } from './lib/editedFiles.mjs'

runHook((input) => {
  const filePath = String(input.file_path || '').trim()
  if (!filePath) return {}

  mkdirSync(dirname(EDITED_FILES_LOG), { recursive: true })
  appendFileSync(EDITED_FILES_LOG, `${filePath}\n`, 'utf8')
  return {}
})
