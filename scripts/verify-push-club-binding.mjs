/**
 * F2: тренер не пишет clients / trainings / memberships в чужой клуб через push (service role обходит RLS).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  assertTrainerClubId,
  needsClientClubForTrainerCheck,
} from '../src/lib/trainer/trainerPushClubBindingCore.js'
import { assertChallengeClub } from '../src/lib/challengePushClubCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const MY = 'club-a'
const OLD = 'club-old'
const OTHER = 'club-b'

console.log('rule')
const foreign = assertTrainerClubId({ profileClubId: MY, payloadClubId: OTHER })
ok(!foreign.ok && /другой клуб/.test(foreign.error), 'чужой club_id — отказ')
ok(assertTrainerClubId({ profileClubId: MY, payloadClubId: MY }).ok, 'свой клуб — ok')
ok(assertTrainerClubId({ profileClubId: MY, payloadClubId: ` ${MY} ` }).ok, 'пробелы не мешают')
ok(assertTrainerClubId({ profileClubId: MY, payloadClubId: '' }).ok, 'пустой — не трогаем (как было)')
ok(assertTrainerClubId({ profileClubId: MY, payloadClubId: null }).ok, 'null — не трогаем (копия на планшете не расходится)')
ok(assertTrainerClubId({ profileClubId: MY }).ok, 'без поля — ok')
ok(
  assertTrainerClubId({ profileClubId: MY, clientClubId: OLD, payloadClubId: OLD }).ok,
  'клуб своего клиента после перевода тренера — ok',
)
ok(
  assertTrainerClubId({ profileClubId: MY, existingClubId: OLD, payloadClubId: OLD }).ok,
  'update строки со старым клубом (списание абонемента после переезда) — ok',
)
ok(
  !assertTrainerClubId({ profileClubId: MY, clientClubId: MY, existingClubId: MY, payloadClubId: OTHER }).ok,
  'update с переносом в третий клуб — отказ',
)
ok(!assertTrainerClubId({ profileClubId: '', payloadClubId: OTHER }).ok, 'тренер без клуба не пишет в клуб')

console.log('lazy client lookup')
ok(!needsClientClubForTrainerCheck({ profileClubId: MY, payloadClubId: MY }), 'свой клуб — без запроса клиента')
ok(!needsClientClubForTrainerCheck({ profileClubId: MY, existingClubId: OLD, payloadClubId: OLD }), 'клуб строки — без запроса')
ok(!needsClientClubForTrainerCheck({ profileClubId: MY, payloadClubId: '' }), 'пусто — без запроса')
ok(needsClientClubForTrainerCheck({ profileClubId: MY, payloadClubId: OLD }), 'иной клуб — сверяем с клубом клиента')

console.log('challenges (клуб из строки в базе)')
const ch = (op, row, payload) => assertChallengeClub({ op, profileClubId: MY, row, payload })
ok(ch('insert', null, { club_id: MY }).ok, 'новый в свой клуб — ok')
ok(!ch('insert', null, { club_id: OTHER }).ok, 'новый в чужой клуб — отказ')
ok(!ch('insert', null, {}).ok, 'новый без клуба — отказ')
ok(!ch('insert', { club_id: OTHER }, { club_id: MY }).ok, 'insert с id чужого челленджа — отказ')
ok(ch('update', { club_id: MY }, { name: 'x' }).ok, 'update своего без club_id — ok')
ok(ch('update', { club_id: MY }, { club_id: MY, name: 'x' }).ok, 'update своего — ok')
ok(!ch('update', { club_id: OTHER }, { club_id: MY, name: 'x' }).ok, 'свой club_id + чужой id — отказ (дыра)')
ok(!ch('update', { club_id: MY }, { club_id: OTHER }).ok, 'перенос своего в чужой клуб — отказ')
ok(!ch('update', { club_id: MY }, { club_id: null }).ok, 'снять клуб со своего — отказ')
ok(!ch('update', null, { club_id: OTHER }).ok, 'update несуществующего в чужой клуб — отказ')
ok(ch('delete', null, {}).ok, 'delete уже удалённого — ok (очередь не застревает)')
ok(ch('delete', { club_id: MY }, {}).ok, 'delete своего — ok')
ok(!ch('delete', { club_id: OTHER }, { club_id: MY }).ok, 'delete чужого — отказ')
ok(!assertChallengeClub({ op: 'update', profileClubId: '', row: { club_id: OTHER }, payload: {} }).ok, 'без клуба в профиле — не трогает чужой')

console.log('wiring')
const root = fileURLToPath(new URL('..', import.meta.url))
const auth = readFileSync(`${root}api/_lib/mutationAuth.js`, 'utf8')
const trainerPart = auth.slice(auth.indexOf("if (!isTrainer) {"))
const calls = trainerPart.match(/trainerClubCheck\(ctx, payload/g) ?? []
ok(calls.length >= 5, 'тренер: insert clients, insert/update trainings, insert/update memberships')
ok(/\.select\('trainer_id, client_id, club_id'\)/.test(trainerPart), 'update тренировки читает клуб строки')
ok(/\.select\('client_id, club_id'\)/.test(trainerPart), 'update абонемента читает клуб строки')
const chCalls = auth.match(/loadChallengeClubRow\(supabaseAdmin, remote_id \|\| payload\.id\)/g) ?? []
ok(chCalls.length === 2, 'challenges: управляющий и тренер читают клуб строки по id')
ok(!/challengeClubId/.test(auth), 'challenges: старой проверки только по payload нет')
const core = readFileSync(`${root}api/_lib/pushRecordCore.js`, 'utf8')
ok(!/authz\.patch/.test(core), 'push не подменяет payload (планшет и облако не расходятся)')

if (failed) {
  console.error(`\nverify-push-club-binding: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-push-club-binding: ok')
