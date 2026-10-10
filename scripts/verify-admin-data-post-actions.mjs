/**
 * admin-data: каждое POST-действие с обработчиком есть в белом списке postActions (иначе 405 на проде).
 * Было: «Разрешить» устройство тренера отвечало 405 (10.10).
 * node scripts/verify-admin-data-post-actions.mjs
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../api/admin-data.js', import.meta.url), 'utf8')
const start = src.indexOf("if (req.method === 'POST') {")
const listStart = src.indexOf('const postActions = new Set([', start)
const listEnd = src.indexOf('])', listStart)
const NOT_ALLOWED = "sendJson(res, 405, { error: 'Method not allowed' })"
const blockEnd = src.indexOf(NOT_ALLOWED, src.indexOf(NOT_ALLOWED, listEnd) + 1)

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

ok(start >= 0 && listStart > start && blockEnd > listEnd, 'нашли POST-блок и postActions в api/admin-data.js')
const allowed = new Set([...src.slice(listStart, listEnd).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]))
const handled = new Set([...src.slice(listEnd, blockEnd).matchAll(/action === '([a-z0-9-]+)'/g)].map((m) => m[1]))

ok(handled.size > 10, `обработчиков POST найдено ${handled.size}`)
for (const a of handled) ok(allowed.has(a), `POST ${a}: обработчик есть, в postActions нет → 405`)
for (const a of allowed) ok(handled.has(a), `POST ${a}: в postActions, но обработчика нет`)

if (failed) {
  console.error(`verify-admin-data-post-actions: ${failed} ошибок`)
  process.exit(1)
}
console.log(`verify-admin-data-post-actions: ок (${handled.size} действий)`)
