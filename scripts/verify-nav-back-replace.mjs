/**
 * Узкий алиас: полная проверка — verify-nav-page-switch.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const r = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-nav-page-switch.mjs', import.meta.url))], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
