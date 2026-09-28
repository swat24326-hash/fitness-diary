/**
 * Разбудить GrokBot по задаче из bridge/tasks/ и дождаться отчёта в bridge/reports/.
 * Ссылка-вебхук — одной строкой в bridge/webhook.url, ключ отправителя — в bridge/webhook.key
 * (папка не в git). Заголовок для ключа — bridge/webhook.header (по умолчанию Authorization: Bearer).
 * Ключ не печатается.
 *
 * Usage: node scripts/bridge-wake.mjs <task-id> [--wait-min=15]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const id = process.argv[2]
const waitMin = Number(process.argv.find((a) => a.startsWith('--wait-min='))?.split('=')[1] ?? 15)
const taskPath = join(ROOT, 'bridge', 'tasks', `${id}.md`)
const reportPath = join(ROOT, 'bridge', 'reports', `${id}.md`)
const urlPath = join(ROOT, 'bridge', 'webhook.url')
const keyPath = join(ROOT, 'bridge', 'webhook.key')
const headerPath = join(ROOT, 'bridge', 'webhook.header')

function authHeaders() {
  if (!existsSync(keyPath)) return {}
  const key = readFileSync(keyPath, 'utf8').trim()
  const name = existsSync(headerPath) ? readFileSync(headerPath, 'utf8').trim() : 'Authorization'
  return { [name]: name.toLowerCase() === 'authorization' ? `Bearer ${key}` : key }
}

if (!id || !existsSync(taskPath)) {
  console.error(`Нет задачи bridge/tasks/${id ?? '<id>'}.md`)
  process.exit(1)
}

if (existsSync(urlPath)) {
  const url = readFileSync(urlPath, 'utf8').trim()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ task: id }),
  })
  console.log(`webhook: HTTP ${res.status}`)
} else {
  console.log('webhook: нет bridge/webhook.url — ждём проверку по расписанию')
}

const done = /status:\s*(ok|fail|needs_owner)/
const deadline = Date.now() + waitMin * 60_000
while (Date.now() < deadline) {
  if (existsSync(reportPath)) {
    const text = readFileSync(reportPath, 'utf8')
    if (done.test(text)) {
      console.log(text)
      process.exit(0)
    }
  }
  await new Promise((r) => setTimeout(r, 10_000))
}
console.error(`Отчёта нет за ${waitMin} мин: bridge/reports/${id}.md`)
process.exit(2)
