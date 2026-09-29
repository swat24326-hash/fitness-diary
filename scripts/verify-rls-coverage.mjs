/**
 * Каждая таблица из supabase/*.sql — с RLS. Без него anon key из бандла (Supabase)
 * или любой вошедший (C2, c2_rest_grants.sql) читает таблицу целиком.
 * Плюс инварианты доступа для таблиц из 20260929130000_rls_gaps.sql.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'supabase')
const files = [
  'schema.sql',
  'policies.sql',
  ...readdirSync(join(dir, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => `migrations/${f}`),
].filter((f) => existsSync(join(dir, f)))
const sql = files.map((f) => readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '')).join('\n')

const created = new Set()
const withRls = new Set()
for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
  created.add(m[1].toLowerCase())
}
for (const m of sql.matchAll(
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi,
)) {
  withRls.add(m[1].toLowerCase())
}
const missing = [...created].filter((t) => !withRls.has(t)).sort()
console.log('RLS coverage')
ok(created.size > 20, `таблицы найдены (${created.size})`)
ok(missing.length === 0, `у всех таблиц включён RLS${missing.length ? `: нет у ${missing.join(', ')}` : ''}`)

/** @returns {{ name: string, cmd: string, body: string }[]} */
function policiesOn(table) {
  const re = new RegExp(
    `create\\s+policy\\s+(\\w+)\\s+on\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi',
  )
  return [...sql.matchAll(re)].map((m) => ({
    name: m[1],
    cmd: (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(m[2])?.[1] ?? 'all').toLowerCase(),
    body: m[2].toLowerCase(),
  }))
}

console.log('rls gaps')
ok(policiesOn('user_push_subscriptions').length === 0, 'push-подписки: политик нет — только сервер')
const ch = policiesOn('challenges')
ok(ch.length > 0 && ch.every((p) => p.cmd === 'select'), 'челленджи: из браузера только чтение')
ok(ch.every((p) => /to\s+authenticated/.test(p.body)), 'челленджи: аноним не читает')
const exp = policiesOn('club_supervisor_expense')
ok(exp.length > 0 && exp.every((p) => /to\s+authenticated/.test(p.body)), 'расходы: только вошедшие')
ok(
  exp.every((p) => /fit_auth_is_admin|fit_auth_is_supervisor/.test(p.body) && !/sales_manager/.test(p.body)),
  'расходы: админ и управляющий, не менеджер продаж',
)
ok(
  exp.filter((p) => /fit_auth_is_supervisor/.test(p.body)).every((p) => /fit_auth_supervisor_club_id/.test(p.body)),
  'расходы: управляющий — только свой клуб',
)

if (failed) {
  console.error(`\nverify-rls-coverage: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-rls-coverage: ok')
