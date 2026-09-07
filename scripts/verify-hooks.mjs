/**
 * Проверка чистой логики хуков Cursor (.cursor/hooks/lib/*).
 * node scripts/verify-hooks.mjs
 *
 * Хуки решают, какие команды спрашивать у владельца и что не пускать в модель.
 * Ошибка здесь = либо агент молча деплоит, либо терминал перестаёт работать.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

import { classifyShellCommand } from '../.cursor/hooks/lib/shellGuardRules.mjs'
import { gitSubcommand, splitSegments } from '../.cursor/hooks/lib/shellCommand.mjs'
import { findSecrets } from '../.cursor/hooks/lib/secretScan.mjs'
import { filterLintable, criticalZones, parseEslintErrors } from '../.cursor/hooks/lib/stopCheckRules.mjs'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const asks = (command) => classifyShellCommand(command).ask

/* --- git: подкоманда распознаётся с флагами и путями --- */
assert(gitSubcommand('git commit -m "fix"') === 'commit', 'git commit')
assert(gitSubcommand('git -C /tmp/repo push origin main') === 'push', 'git -C ... push')
assert(gitSubcommand('git --no-pager status') === 'status', 'git --no-pager status')
assert(gitSubcommand('npm run lint') === null, 'без git -> null')
assert(splitSegments('npm run lint && git push').length === 2, 'сегменты по &&')

/* --- спрашиваем подтверждение --- */
assert(asks('git commit -m "feat"'), 'коммит -> ask')
assert(asks('git push origin main'), 'push -> ask')
assert(asks('npm run lint; git push --force'), 'push во втором сегменте -> ask')
assert(asks('npx vercel --prod --yes'), 'деплой prod -> ask')
assert(asks('npm run db:migrate:loyalty'), 'миграция базы -> ask')
assert(asks('node scripts/apply-loyalty-migration.mjs'), 'apply-* миграция -> ask')
assert(asks('npx supabase db query --linked --file supabase/policies.sql'), 'supabase db -> ask')
assert(asks('npm run qa'), 'qa с прод-частью -> ask')
assert(asks('npm run qa:roles'), 'qa:roles на проде -> ask')
assert(asks('rm -rf dist'), 'rm -rf -> ask')
assert(asks('git reset --hard HEAD~1'), 'reset -> ask')
assert(asks('git clean -fd'), 'clean -> ask')
assert(asks('git merge origin/main'), 'merge -> ask')
assert(asks('gh pr create --fill'), 'gh pr -> ask')
assert(asks('psql $DATABASE_URL -c "delete from trainings"'), 'psql -> ask')

/* --- пропускаем обычную работу без вопросов --- */
assert(!asks('npm run lint'), 'lint -> allow')
assert(!asks('npm run qa:local'), 'qa:local -> allow')
assert(!asks('npm run qa:critical'), 'qa:critical -> allow')
assert(!asks('npm run build'), 'build -> allow')
assert(!asks('git status --porcelain'), 'git status -> allow')
assert(!asks('git diff --stat'), 'git diff -> allow')
assert(!asks('git log --grep=commit'), 'git log с словом commit -> allow')
assert(!asks('node scripts/verify-hooks.mjs'), 'verify -> allow')
assert(!asks('node -v'), 'node -v -> allow')

/* --- секреты: боевые ключи не уезжают в модель --- */
const anonJwt = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from('{"iss":"supabase","role":"anon","iat":1700000000}').toString('base64url'),
  'c2lnbmF0dXJlc2lnbmF0dXJl',
].join('.')
const serviceJwt = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from('{"iss":"supabase","role":"service_role","iat":1700000000}').toString('base64url'),
  'c2lnbmF0dXJlc2lnbmF0dXJl',
].join('.')

assert(findSecrets(`ключ ${serviceJwt}`).length > 0, 'service_role JWT -> блок')
assert(findSecrets(`VITE_SUPABASE_ANON_KEY=${anonJwt}`).length === 0, 'anon key -> не секрет')
assert(findSecrets('SUPABASE_SERVICE_ROLE_KEY=sbp_abcdef0123456789abcdef').length > 0, 'SERVICE_ROLE=... -> блок')
assert(findSecrets('token sb_secret_abcdef0123456789').length > 0, 'sb_secret_ -> блок')
assert(findSecrets('GEMINI_API_KEY=AIzaAbCdEf0123456789AbCdEf0123456789xyz').length > 0, 'ключ Gemini -> блок')
assert(findSecrets('почини Sync на планшете, пропала тренировка').length === 0, 'обычный запрос -> чисто')
assert(findSecrets('смотри переменную SUPABASE_SERVICE_ROLE_KEY в Vercel').length === 0, 'имя переменной без значения -> чисто')
assert(findSecrets(readFileSync('.env.example', 'utf8')).length === 0, '.env.example -> чисто')

/* --- stop-хук: что линтуем и что критично --- */
assert(filterLintable(['src/lib/syncService.js', 'docs/SYNC.md']).length === 1, 'линтуем только js/jsx/mjs')
assert(filterLintable(['node_modules/x/index.js', 'dist/app.js']).length === 0, 'node_modules и dist пропускаем')
assert(filterLintable(['supabase/functions/tts/index.js', 'public/sw.js']).length === 0, 'ignores eslint.config пропускаем')
assert(filterLintable(['.cursor/hooks/guard-shell.mjs']).length === 1, 'сами хуки тоже линтуем')

/* --- stop-хук: разбор отчёта eslint --- */
const eslintReport = JSON.stringify([
  {
    filePath: 'C:/proj/src/lib/syncService.js',
    messages: [
      { severity: 2, line: 12, column: 3, message: 'Parsing error: Unexpected token', ruleId: null },
      { severity: 1, line: 40, column: 7, message: "'x' is assigned but never used", ruleId: 'no-unused-vars' },
    ],
  },
  { filePath: 'C:/proj/src/App.jsx', messages: [] },
])
const parsed = parseEslintErrors(eslintReport)
assert(parsed.length === 1, 'из отчёта берём только ошибки, предупреждения игнорируем')
assert(parsed[0].includes('syncService.js:12:3') && parsed[0].includes('(parse)'), 'ошибка описана файлом, строкой и правилом')
assert(parseEslintErrors('не json').length === 0, 'мусор вместо JSON -> пусто, хук не падает')
assert(parseEslintErrors('').length === 0, 'пустой вывод -> пусто')
assert(criticalZones(['src/lib/syncService.js']).length > 0, 'sync -> критический путь')
assert(criticalZones(['src/lib/membershipRules.js']).length > 0, 'абонементы -> критический путь')
assert(criticalZones(['api/_lib/clubMonthlyAgg.js']).length > 0, 'agg -> критический путь')
assert(criticalZones(['src/styles/sales.css', 'docs/README.md']).length === 0, 'стили и docs -> не критично')
assert(criticalZones(['.cursor/rules/fitness-diary-sync.mdc']).length === 0, 'правило про sync -> текст, не критический путь')
assert(criticalZones(['docs/SYNC.md', 'docs/PAYMENTS_DOMAIN.md']).length === 0, 'docs со словами sync/абонемент -> не критично')
assert(criticalZones(['supabase/migrations/20260804223000_memberships_session_visits.sql']).length > 0, 'миграция абонементов -> критический путь')

/* --- хуки целиком: запускаем скрипт и разбираем его ответ --- */
// Проверяем контракт с Cursor: валидный JSON на stdout (буфер не обрезан) и нужные поля.
// Строки команд ниже — данные для хука, они не выполняются.
const STATE_FILE = '.cursor/hooks/.state/verify-edited-files.log'
mkdirSync(dirname(STATE_FILE), { recursive: true })
rmSync(STATE_FILE, { force: true })

function callHook(script, input) {
  const run = spawnSync(process.execPath, [`.cursor/hooks/${script}`], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CURSOR_HOOKS_STATE_FILE: STATE_FILE },
    maxBuffer: 32 * 1024 * 1024,
  })
  try {
    return JSON.parse(run.stdout)
  } catch {
    return { parseFailed: true, stdout: run.stdout, stderr: run.stderr }
  }
}

const pushAnswer = callHook('guard-shell.mjs', { command: 'git push origin main' })
assert(pushAnswer.permission === 'ask', 'guard-shell: push -> ask')
assert(typeof pushAnswer.user_message === 'string' && pushAnswer.user_message.length > 0, 'guard-shell: есть текст для владельца')
assert(callHook('guard-shell.mjs', { command: 'npm run lint' }).permission === 'allow', 'guard-shell: lint -> allow')
assert(callHook('guard-shell.mjs', {}).permission === 'allow', 'guard-shell: пустой вход -> allow (fail-open)')

assert(callHook('guard-prompt-secrets.mjs', { prompt: 'проверь sb_secret_abcdef0123456789' }).continue === false, 'guard-prompt: секрет -> отмена отправки')
assert(callHook('guard-prompt-secrets.mjs', { prompt: 'почини Sync на планшете' }).continue === true, 'guard-prompt: обычный запрос -> отправляем')

assert(callHook('guard-read-secrets.mjs', { file_path: 'c:/proj/.env', content: 'X=1' }).permission === 'deny', 'guard-read: .env -> deny')
assert(callHook('guard-read-secrets.mjs', { file_path: 'c:/proj/.env.example', content: 'X=' }).permission === 'allow', 'guard-read: .env.example -> allow')

// Правка → прерванный ответ (список сохраняется) → завершённый ответ (напоминание + очистка).
// .sql не линтуется, поэтому eslint здесь не запускается — проверка быстрая.
callHook('track-edit.mjs', { file_path: 'supabase/migrations/20260804223000_memberships_session_visits.sql' })
assert(existsSync(STATE_FILE), 'track-edit: правка записана')
assert(Object.keys(callHook('stop-check.mjs', { status: 'aborted', loop_count: 0 })).length === 0, 'stop-check: прерванный ответ -> молчим')
assert(existsSync(STATE_FILE), 'stop-check: при прерывании список не теряется')

const stopAnswer = callHook('stop-check.mjs', { status: 'completed', loop_count: 0 })
assert(/критический путь/.test(stopAnswer.followup_message || ''), 'stop-check: критический путь -> напоминание про QA')
assert(!existsSync(STATE_FILE), 'stop-check: список очищен после проверки')

callHook('track-edit.mjs', { file_path: '.cursor/rules/fitness-diary-sync.mdc' })
assert(Object.keys(callHook('stop-check.mjs', { status: 'completed', loop_count: 0 })).length === 0, 'stop-check: правка правила про sync -> без напоминания')
rmSync(STATE_FILE, { force: true })

if (failed > 0) {
  console.error(`\n${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nвсе проверки хуков прошли')
