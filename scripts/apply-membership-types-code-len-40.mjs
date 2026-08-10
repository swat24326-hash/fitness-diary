/**
 * Лимит длины названия типа карты: 40 символов.
 *
 *   npm run db:migrate:membership-type-code-len -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260810130000_membership_types_code_len_40.sql'
const VERIFY_SQL = `select pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.membership_types'::regclass
  and conname = 'membership_types_code_len';
`

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function readDotEnv(key) {
  const p = resolve('.env')
  if (!existsSync(p)) return ''
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    if (m[1].trim() === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function projectRefFromUrl(url) {
  const m = String(url ?? '').match(/https:\/\/([^.]+)\.supabase\.co/)
  return m ? m[1] : ''
}

function run(label, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (r.status !== 0) fail(`✗ ${label}`)
  console.log(`✓ ${label}`)
}

function withVerifyFile(fn) {
  const verifyPath = resolve(tmpdir(), `fd-verify-code-len-${Date.now()}.sql`)
  writeFileSync(verifyPath, VERIFY_SQL, 'utf8')
  try {
    return fn(verifyPath)
  } finally {
    try {
      unlinkSync(verifyPath)
    } catch {
      /* ignore */
    }
  }
}

const useLinked = process.argv.includes('--linked')
if (!existsSync(resolve(MIGRATION))) fail(`Нет файла ${MIGRATION}`)

if (useLinked) {
  run('apply migration (linked)', ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
  withVerifyFile((verifyPath) => {
    run('verify constraint (linked)', ['db', 'query', '--linked', '--file', verifyPath, '--yes'])
  })
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail('Нужен пароль Postgres или флаг --linked.\n  npm run db:migrate:membership-type-code-len -- --linked')
  }
  const ref = projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref в VITE_SUPABASE_URL (.env)')
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  run('apply migration', ['db', 'query', '--db-url', dbUrl, '--file', MIGRATION, '--yes'])
  withVerifyFile((verifyPath) => {
    run('verify constraint', ['db', 'query', '--db-url', dbUrl, '--file', verifyPath, '--yes'])
  })
}

console.log('\nМиграция membership_types_code_len_40 применена.')
