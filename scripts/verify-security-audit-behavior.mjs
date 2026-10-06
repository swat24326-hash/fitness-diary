/**
 * Аудит 07.10 (F2/F3) — поведение, а не текст кода: authorizePush и executePushRecord на базе в памяти.
 * Сценарии зала обязаны проходить, атаки — нет; на частых операциях не растёт число запросов к БД;
 * очередь планшета по-прежнему понимает ответы сервера.
 */
import { authorizePush } from '../api/_lib/mutationAuth.js'
import { executePushRecord } from '../api/_lib/pushRecordCore.js'
import { pgErrorPublic } from '../api/_lib/dbErrorPublicCore.js'
import { isDuplicateInsertError, isUnrecoverablePushError } from '../src/lib/syncFlushResult.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T1 = U(1)
const T2 = U(2)
const C1 = U(11)
const C2 = U(12)
const C_OLD = U(13)
const TR1 = U(21)
const TR_OLD = U(22)
const M1 = U(31)
const M_OLD = U(32)
const A = 'club-a'
const B = 'club-b'
const OLD = 'club-old'

const TABLES = {
  clients: [
    { id: C1, trainer_id: T1, club_id: A },
    { id: C2, trainer_id: T2, club_id: A },
    { id: C_OLD, trainer_id: T1, club_id: OLD },
  ],
  trainings: [
    { id: TR1, trainer_id: T1, client_id: C1, club_id: A },
    { id: TR_OLD, trainer_id: T1, client_id: C_OLD, club_id: OLD },
  ],
  memberships: [
    { id: M1, client_id: C1, club_id: A },
    { id: M_OLD, client_id: C_OLD, club_id: OLD },
  ],
}

/** Минимальный клиент данных: select/eq/maybeSingle + insert с заданной ошибкой. */
function mockDb({ insertError = null, throwOn = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      if (throwOn === table) throw new Error(`connect ECONNREFUSED 10.0.0.5:6432 ${table}`)
      const filters = []
      const result = { data: null, error: insertError }
      const q = {
        select: () => q,
        eq: (c, v) => {
          filters.push([c, v])
          return q
        },
        async maybeSingle() {
          if (q.inserting) return result
          calls.push(table)
          const row = (TABLES[table] ?? []).find((r) => filters.every(([c, v]) => String(r[c]) === String(v)))
          return { data: row ?? null, error: null }
        },
        insert() {
          q.inserting = true
          return q
        },
        then: (res, rej) => Promise.resolve(result).then(res, rej),
      }
      return q
    },
  }
}

const trainerCtx = (db, club = A) => ({
  supabaseAdmin: db,
  user: { id: T1 },
  profile: { id: T1, club_id: club },
  isTrainer: true,
  isAdmin: false,
  isSalesManager: false,
  isSupervisor: false,
})

async function run(name, expectOk, table, op, data, remoteId, { ctx, maxCalls } = {}) {
  const db = mockDb()
  const res = await authorizePush(ctx?.(db) ?? trainerCtx(db), table, op, data, remoteId ?? null)
  ok(res.ok === expectOk, `${name}${res.ok ? '' : ` → «${res.error}»`}`)
  if (maxCalls != null) ok(db.calls.length <= maxCalls, `  запросов к БД ${db.calls.length} ≤ ${maxCalls}`)
  return res
}

const realWarn = console.warn
console.warn = () => {}

console.log('зал: обязано проходить')
await run('новый клиент со своим клубом', true, 'clients', 'insert', { id: U(90), trainer_id: T1, club_id: A }, null, { maxCalls: 0 })
await run('новый клиент без клуба (как было)', true, 'clients', 'insert', { id: U(91), trainer_id: T1 })
await run('правка клиента без club_id', true, 'clients', 'update', { name: 'Иван' }, C1)
await run('новая тренировка', true, 'trainings', 'insert', { id: U(92), trainer_id: T1, client_id: C1, club_id: A }, null, { maxCalls: 1 })
await run('новая тренировка с club_id: null', true, 'trainings', 'insert', { id: U(93), trainer_id: T1, client_id: C1, club_id: null })
await run('«Закончить»: update draft → completed', true, 'trainings', 'update', { id: TR1, trainer_id: T1, client_id: C1, club_id: A, status: 'completed' }, TR1, { maxCalls: 1 })
await run('тренировка клиенту из прежнего клуба (перевод тренера)', true, 'trainings', 'insert', { id: U(94), trainer_id: T1, client_id: C_OLD, club_id: OLD }, null, { maxCalls: 2 })
await run('правка старой тренировки со старым клубом', true, 'trainings', 'update', { id: TR_OLD, trainer_id: T1, client_id: C_OLD, club_id: OLD }, TR_OLD, { maxCalls: 1 })
await run('списание абонемента (update used_trainings)', true, 'memberships', 'update', { id: M1, client_id: C1, club_id: A, used_trainings: 3 }, M1, { maxCalls: 2 })
await run('списание старого абонемента после переезда', true, 'memberships', 'update', { id: M_OLD, client_id: C_OLD, club_id: OLD, used_trainings: 1 }, M_OLD, { maxCalls: 2 })
await run('новый абонемент своему клиенту', true, 'memberships', 'insert', { id: U(95), client_id: C1, club_id: A }, null, { maxCalls: 1 })
await run('тренер переведён в B: тренировка клиенту из A', true, 'trainings', 'insert', { id: U(96), trainer_id: T1, client_id: C1, club_id: A }, null, { ctx: (db) => trainerCtx(db, B) })

console.log('атака: обязано отказывать')
await run('клиент в чужой клуб', false, 'clients', 'insert', { id: U(80), trainer_id: T1, club_id: B })
await run('тренировка в чужой клуб', false, 'trainings', 'insert', { id: U(81), trainer_id: T1, client_id: C1, club_id: B })
await run('перенос своей тренировки в чужой клуб (update)', false, 'trainings', 'update', { id: TR1, club_id: B }, TR1)
await run('абонемент в чужой клуб', false, 'memberships', 'insert', { id: U(82), client_id: C1, club_id: B })
await run('перенос абонемента в чужой клуб (update)', false, 'memberships', 'update', { id: M1, club_id: B }, M1)
await run('тренировка чужому клиенту', false, 'trainings', 'insert', { id: U(83), trainer_id: T1, client_id: C2, club_id: A })
await run('смена клуба своего клиента', false, 'clients', 'update', { club_id: B }, C1)

console.log('другие роли не задеты')
await run('админ переносит тренировку (каскад переезда)', true, 'trainings', 'update', { id: TR1, club_id: B }, TR1, {
  ctx: (db) => ({ ...trainerCtx(db), isTrainer: false, isAdmin: true }),
})

console.log('очередь планшета понимает ответы')
ok(!isUnrecoverablePushError(403, 'Нельзя записать в другой клуб'), 'отказ по клубу не снимает запись с очереди молча')
ok(!isUnrecoverablePushError(403, 'Ошибка проверки доступа'), 'сбой БД при проверке прав — повтор, не потеря')
ok(isUnrecoverablePushError(403, 'Нет доступа к клиенту'), 'прежние «снять с очереди» работают')
ok(isDuplicateInsertError({ message: pgErrorPublic({ code: '23505' }).message }), 'дубль insert по-прежнему = synced')

console.log('ответ push без сырого текста БД')
const rawErr = {
  code: '23503',
  message: 'insert or update on table "clients" violates foreign key constraint "clients_club_id_fkey"',
  detail: 'Key (club_id)=(+79991234567) is not present in table "clubs".',
}
const ins = await executePushRecord(trainerCtx(mockDb({ insertError: rawErr })), {
  table_name: 'clients',
  operation: 'insert',
  data: { id: U(70), trainer_id: T1, club_id: A, name: 'Тест' },
})
ok(ins.status === 400 && !/\+7999|Key \(|table "/.test(ins.error), `insert clients: 400 без значений («${ins.error}»)`)
ok(/clients_club_id_fkey/.test(ins.error), 'insert clients: имя ограничения для «Помощи» на месте')
const trn = await executePushRecord(trainerCtx(mockDb({ insertError: { code: '23514', message: 'new row for relation "trainings" violates check constraint "trainings_type_check"', detail: 'Failing row contains (Иванов)' } })), {
  table_name: 'trainings',
  operation: 'insert',
  data: { id: U(71), trainer_id: T1, client_id: C1, club_id: A, date: '2026-10-07', type: 'Силовая', status: 'draft', data: {} },
})
ok(trn.status === 400 && /trainings_type_check/.test(trn.error) && !/Иванов|relation/.test(trn.error), `insert trainings: 400 без значений («${trn.error}»)`)
const boom = await executePushRecord(trainerCtx(mockDb({ throwOn: 'clients' })), {
  table_name: 'clients',
  operation: 'insert',
  data: { id: U(72), trainer_id: T1, club_id: A },
})
ok(boom.status === 500 && boom.error === 'Внутренняя ошибка сервера', '500 без текста исключения (адрес БД не светится)')

console.warn = realWarn

if (failed) {
  console.error(`\nverify-security-audit-behavior: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-security-audit-behavior: ok')
