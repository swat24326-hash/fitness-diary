/**
 * memberships.hall (pz|tz|az) — один client, абоны разных залов.
 *   npm run db:migrate:memberships-hall -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260810140000_memberships_hall.sql'
const VERIFY_SQL = `select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'memberships' and column_name = 'hall';
`

function fail(msg) {
  console.error(msg)
  process.exit(1)
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

if (!existsSync(resolve(MIGRATION))) fail(`Нет файла ${MIGRATION}`)

if (!process.argv.includes('--linked')) {
  console.log(`Файл: ${MIGRATION}`)
  console.log('Применить на linked: npm run db:migrate:memberships-hall -- --linked')
  process.exit(0)
}

run(`apply ${MIGRATION}`, ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])

const dir = mkdtempSync(join(tmpdir(), 'fd-hall-'))
const verifyFile = join(dir, 'verify-hall.sql')
try {
  writeFileSync(verifyFile, VERIFY_SQL, 'utf8')
  run('verify memberships.hall', ['db', 'query', '--linked', '--file', verifyFile, '--yes'])
} finally {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
console.log('\nГотово: memberships.hall на linked.')
