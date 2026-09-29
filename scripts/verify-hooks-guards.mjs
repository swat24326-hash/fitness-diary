/**
 * Обходы guard-хуков, найденные аудитом харнесса, и починка путей stop-check.
 * Образцы ключей собираются склейкой частей: целиком в файле их нет,
 * иначе guard-read-secrets запретит агенту читать и поддерживать этот тест.
 *
 * node scripts/verify-hooks-guards.mjs
 */
import { classifyShellCommand } from '../.cursor/hooks/lib/shellGuardRules.mjs'
import { findSecrets } from '../.cursor/hooks/lib/secretScan.mjs'
import { repairUtf8Mojibake, resolveHookPath } from '../.cursor/hooks/lib/pathEncoding.mjs'
import { criticalZones } from '../.cursor/hooks/lib/stopCheckRules.mjs'

let failed = 0
function ok(cond, msg) {
  console.log(`${cond ? 'ok' : 'FAIL'}: ${msg}`)
  if (!cond) failed += 1
}

const join = (...parts) => parts.join('')

const ASK = [
  'git status & git reset --hard',
  'git status\ngit reset --hard',
  'rm -fr dist',
  'rm -Recurse -Force dist',
  'ri -r dist',
  'rd /s /q dist',
  'rmdir /s /q dist',
  'del /s /q dist',
  'git push --force origin main',
  'git push -f origin main',
  'git push origin +main',
  'git branch -D main',
  'git stash clear',
  'node scripts/agent-qa.mjs',
  'node scripts/deep-qa.mjs',
  'npx supabase migration up',
  'vercel env rm X production',
  'Get-Content .env',
  'type .env.local',
  'cat C:\\p\\.env.production',
]
for (const command of ASK) ok(classifyShellCommand(command).ask, `ask: ${JSON.stringify(command)}`)

const ALLOW = [
  'git push origin main',
  'git commit -m "fix: x"',
  'npx vercel --prod --yes',
  'npm run lint 2>&1 | Select-Object -Last 3',
  'node scripts/agent-qa.mjs --skip-prod',
  'rm -f dist/a.js',
  'git branch -d feature/x',
  'git stash list',
  'Get-Content .env.example',
  'rg "import.meta.env" src',
]
for (const command of ALLOW) ok(!classifyShellCommand(command).ask, `allow: ${JSON.stringify(command)}`)

const b64 = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url')
const jwt = (role) => [join('ey', 'JhbGciOiJIUzI1NiJ9'), b64({ iss: 'supabase', role, exp: 9999999999 }), 'c2lnbmF0dXJlZmFrZWZha2U'].join('.')

const SECRET = [
  [join('DATABASE_URL=postgres', 'ql://fit:', 'S3cretPassw0rd', '@rc1a-x.mdb.yandexcloud.net:6432/db'), 'пароль в строке подключения'],
  [join('123456789', ':AA', 'Habcdefghijklmnopqrstuvwxyz012345678'), 'токен Telegram-бота'],
  [join('YC_API_KEY=', 'AQ', 'VN', 'abcdefghijklmnopqrstuvwxyz0123456'), 'ключ Yandex Cloud'],
  [join('# SERVICE_ROLE_KEY=your-key-here\n', 'SUPABASE_SERVICE', '_ROLE_KEY=', 'abcdefghijklmnopqrstuvwx12'), 'настоящий ключ после заглушки'],
  [join('Authorization: Bearer ', jwt('service_role')), 'JWT service_role в заголовке'],
]
for (const [text, label] of SECRET) ok(findSecrets(text).length > 0, `секрет: ${label}`)

const NOT_SECRET = [
  ['const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY', 'чтение из env в коде'],
  [join('SUPABASE_SERVICE', '_ROLE_KEY=', 'your-service-role-key-here'), 'заглушка .env.example'],
  ['DATABASE_URL=postgresql://user:${PGPASSWORD}@host:5432/db', 'пароль из переменной'],
  [jwt('anon'), 'anon JWT'],
]
for (const [text, label] of NOT_SECRET) ok(findSecrets(text).length === 0, `не секрет: ${label}`)

const REAL = 'C:\\Users\\u\\Desktop\\разработка\\app\\src\\lib\\syncService.js'
const BROKEN = new TextDecoder('windows-1251').decode(Buffer.from(REAL, 'utf8'))
ok(BROKEN !== REAL, 'пример порчи пути воспроизводится')
ok(repairUtf8Mojibake(BROKEN) === REAL, 'испорченный путь восстанавливается')
ok(repairUtf8Mojibake(REAL) === null, 'нормальный путь с кириллицей не трогаем')
ok(repairUtf8Mojibake('C:\\app\\a.js') === null, 'латинский путь не трогаем')
ok(resolveHookPath(BROKEN, (p) => p === REAL) === REAL, 'stop-check получает существующий путь')
ok(resolveHookPath(REAL, (p) => p === REAL) === REAL, 'существующий путь не меняется')
ok(resolveHookPath('C:\\нет.js', () => false) === 'C:\\нет.js', 'несуществующий путь возвращается как есть')

const CRITICAL = [
  'api/_lib/mutationAuth.js',
  'src/lib/localDb.js',
  'src/lib/dataAccess.js',
  'src/lib/idbRetention.js',
  'src/pages/trainer/TrainingPage.jsx',
  'src/lib/trainingDraftRestoreCore.js',
  'src/hooks/useTrainingDraftHideFlush.js',
  'src/lib/trainingPersistStatusCore.js',
  'src/lib/admin/clubAttendanceAggCore.js',
  'src/lib/hr/hrSessionPersistCore.js',
  'src/lib/loyalty/loyaltyPersistCore.js',
]
for (const path of CRITICAL) ok(criticalZones([path]).length > 0, `критический путь: ${path}`)
ok(criticalZones(['src/lib/admin/salesPlanRowPersistCore.js']).length === 0, 'план продаж не критический путь зала')
ok(criticalZones(['docs/SYNC.md']).length === 0, 'документ не критический путь')

if (failed) {
  console.error(`verify-hooks-guards: FAIL ${failed}`)
  process.exit(1)
}
console.log('verify-hooks-guards: OK')
