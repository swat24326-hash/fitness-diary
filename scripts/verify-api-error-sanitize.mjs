/**
 * F3: значения строк и сырой текст Postgres не уходят клиенту; имя ограничения остаётся
 * (схема, не данные) — на нём держатся подсказки «Помощи» на планшете.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pgErrorPublic, publicDbErrorMessage } from '../api/_lib/dbErrorPublicCore.js'
import { restV1ErrorFromPg } from '../api/_lib/pgRest/restV1Shape.js'
import { suggestErrorHint } from '../src/lib/appDiagnostics.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const SECRET_BITS = ['+79991234567', 'Key (', 'Failing row', 'is not present', 'public.', '10.0.0.5', 'ECONNREFUSED', 'of relation', 'internal error']
const samples = [
  { code: '23505', message: 'duplicate key value violates unique constraint "clients_phone_key"', detail: 'Key (phone)=(+79991234567) already exists.' },
  { code: '23503', message: 'insert or update on table "trainings" violates foreign key constraint "trainings_club_id_fkey"', detail: 'Key (club_id)=(x) is not present in table "clubs".' },
  { code: '42703', message: 'column "club_id" of relation "users_pkey" does not exist' },
  { code: '42P01', message: 'relation "public.trainings" does not exist' },
  { code: '42501', message: 'new row violates row-level security policy for table "trainings"' },
  { code: '23514', message: 'new row for relation "trainings" violates check constraint "trainings_type_check"', detail: 'Failing row contains (Иванов, +79991234567).' },
  { code: '22P02', message: 'invalid input syntax for type uuid: "+79991234567"' },
  { code: 'XX000', message: 'internal error at public.trainings club_id' },
  { message: 'connect ECONNREFUSED 10.0.0.5:6432 trainings' },
]

console.log('mapper')
const realWarn = console.warn
console.warn = () => {}
for (const e of samples) {
  const pub = pgErrorPublic(e)
  const rest = restV1ErrorFromPg(e)
  const msg = publicDbErrorMessage(e, 'verify')
  const blob = JSON.stringify([pub, rest.body, msg])
  ok(!SECRET_BITS.some((s) => blob.includes(s)), `${e.code ?? 'no-code'}: без имён и значений`)
  ok(/[а-яё]/i.test(pub.message), `${e.code ?? 'no-code'}: текст на русском`)
  ok(rest.body.details === null && rest.body.hint === null, `${e.code ?? 'no-code'}: details/hint пустые`)
}
console.warn = realWarn

console.log('client contract')
ok(restV1ErrorFromPg({ code: '42501' }).status === 403, 'RLS → 403')
ok(restV1ErrorFromPg({ code: '23505' }).status === 409, 'дубль → 409')
ok(restV1ErrorFromPg({ code: '42P01' }).status === 404, 'нет таблицы → 404')
ok(restV1ErrorFromPg({ code: '23505' }).body.code === '23505', 'SQLSTATE сохраняется (клиент ветвится по code)')
ok(/duplicate key/.test(pgErrorPublic({ code: '23505' }).message), 'маркер duplicate key (isDuplicateInsertError)')
ok(/foreign key/.test(pgErrorPublic({ code: '23503' }).message), 'маркер foreign key')
ok(/does not exist/.test(pgErrorPublic({ code: '42P01' }).message), 'маркер does not exist (фоллбэк без миграции)')
ok(/permission/.test(pgErrorPublic({ code: '42501' }).message), 'маркер permission')
ok(pgErrorPublic({}).code === 'PGRST000', 'без code — PGRST000')
ok(
  pgErrorPublic({ code: '23505', message: 'violates unique constraint "x\\" OR 1=1"' }).message.endsWith('(duplicate key)'),
  'имя ограничения только из [a-z0-9_] — иначе не показываем',
)
ok(!/\[/.test(pgErrorPublic({ code: 'XX000', message: 'constraint "secret_name"' }).message), 'неизвестный код — без имени ограничения')

console.log('tablet hints (appDiagnostics)')
const hintFor = (e) => suggestErrorHint({ error: pgErrorPublic(e).message, status: 400 })
ok(
  /веса ссылалась/.test(hintFor({ code: '23503', message: 'violates foreign key constraint "client_weight_entries_training_id_fkey"' })),
  'вес → тренировка: подсказка жива',
)
ok(
  /Заявка ссылалась/.test(hintFor({ code: '23503', message: 'violates foreign key constraint "sale_clips_client_id_fkey"' })),
  'заявка → клиент: подсказка жива',
)
ok(
  /Старый формат тренировки/.test(hintFor({ code: '23514', message: 'violates check constraint "trainings_type_check"' })),
  'старый формат тренировки: подсказка жива',
)
ok(/не проходят проверку/.test(hintFor({ code: '23514', message: 'violates check constraint "other_check"' })), 'прочий check: общая подсказка')

console.log('wiring')
const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(`${root}${p}`, 'utf8')
const rawSend = /sendJson\(res, [45]\d\d, \{ error: [\w.]+\.message \}\)/
for (const p of ['api/get-client.js', 'api/list-clients.js', 'api/trainer-pull.js']) {
  ok(!rawSend.test(read(p)), `${p}: нет сырого .message в ответе`)
}
const push = read('api/_lib/pushRecordCore.js')
ok(!/error: (error|result\.error|existingErr|up\.error)\.message/.test(push), 'pushRecordCore: нет сырого .message в ответе')
ok(!/: error\.message\s*\n/.test(push), 'pushRecordCore: ветки errMsg без сырого текста')
ok(!/String\(e\.message\) : 'Server error'/.test(push), 'pushRecordCore: 500 без текста исключения')
ok(!/error: e\?\.message \? String\(e\.message\)/.test(read('api/_lib/mutationAuth.js')), 'mutationAuth: catch без сырого текста')
ok(!/error: e\?\.message \? String\(e\.message\)/.test(read('api/_lib/adminData/loyaltyHandlers.js')), 'loyalty: 500 без сырого текста')
ok(/logDbError\(`rest-v1/.test(read('api/_lib/restV1Handler.js')), '/rest/v1: сырой текст в лог сервера')

if (failed) {
  console.error(`\nverify-api-error-sanitize: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-api-error-sanitize: ok')
