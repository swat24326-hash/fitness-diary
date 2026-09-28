/**
 * RLS на public.users: список сотрудников не открыт анониму и любому вошедшему, писать — только админ.
 * Статическая проверка миграции (без базы); живой пробник — на стенде C2 (docs/R2_C2_STAGING_RUNBOOK.md).
 * node scripts/verify-users-rls.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'

const MIGRATION = 'supabase/migrations/20260929120000_users_rls.sql'
let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const sql = readFileSync(MIGRATION, 'utf8')
const code = sql.replace(/--[^\n]*/g, '')
const policies = [...code.matchAll(/CREATE POLICY (\w+) ON public\.users([\s\S]*?);/g)].map((m) => ({
  name: m[1],
  body: m[2],
}))

ok(/ALTER TABLE public\.users ENABLE ROW LEVEL SECURITY/.test(code), 'RLS на users включён')
ok(policies.length === 3, 'три политики: свой профиль, админ, клуб для продаж/управляющего')
ok(policies.every((p) => /TO authenticated/.test(p.body)), 'все политики только для вошедших (аноним ничего не видит)')
ok(!/USING \(\s*true\s*\)/i.test(code), 'нет «открыть всем» (USING true)')
ok(!/\bTO (anon|public)\b/i.test(code), 'ничего не выдано anon / public')

const writers = policies.filter((p) => !/FOR SELECT/.test(p.body))
ok(writers.length === 1 && writers[0].name === 'users_admin_all', 'писать в users может только админ')
ok(/fit_auth_is_admin\(\)[\s\S]*WITH CHECK \(public\.fit_auth_is_admin\(\)\)/.test(writers[0]?.body ?? ''), 'у админа и USING, и WITH CHECK')

const self = policies.find((p) => p.name === 'users_self_read')
ok(/id = auth\.uid\(\)/.test(self?.body ?? '') && /auth\.jwt\(\) ->> 'email'/.test(self?.body ?? ''), 'свой профиль по id и по почте (старые строки id ≠ auth.uid)')

const club = policies.find((p) => p.name === 'users_club_staff_read')
ok(/club_id IS NOT NULL/.test(club?.body ?? ''), 'клубная видимость не срабатывает на пустом club_id')
ok(!/fit_auth_is_trainer/.test(club?.body ?? ''), 'тренер не видит коллег — только себя')

const used = [...new Set([...code.matchAll(/public\.(fit_auth_\w+)\(/g)].map((m) => m[1]))]
const defined = new Set(
  readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql') && f < '20260929120000')
    .flatMap((f) => [...readFileSync(`supabase/migrations/${f}`, 'utf8').matchAll(/FUNCTION public\.(fit_auth_\w+)\(/g)].map((m) => m[1]))
    .concat([...readFileSync('supabase/policies.sql', 'utf8').matchAll(/FUNCTION public\.(fit_auth_\w+)\(/g)].map((m) => m[1])),
)
const missing = used.filter((f) => !defined.has(f))
ok(missing.length === 0, `функции прав объявлены раньше миграции${missing.length ? `: нет ${missing.join(', ')}` : ''}`)

if (failed) process.exit(1)
console.log('verify-users-rls: all passed')
