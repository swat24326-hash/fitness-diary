/**
 * node scripts/verify-training-membership-ensure.mjs
 * Догрузка абонементов на планшете: прочерки в плитке и отказ «Закончить» — INC-2026-09-07-02.
 */
import {
  TRAINING_MEMBERSHIP_ENSURE_RETRY_MS,
  shouldEnsureClientMembershipsBeforeDebit,
  shouldEnsureClientMembershipsOnOpen,
} from '../src/lib/trainer/trainingMembershipEnsureCore.js'
import { readFileSync } from 'node:fs'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const base = {
  clientId: 'c1',
  status: 'draft',
  hasSummary: false,
  membershipsCount: 0,
  online: true,
  isAdmin: false,
  lastAttemptAt: 0,
  now: 1_000_000,
}

/* Главный случай Анжелики: черновик открыт, абонемента локально нет, сеть есть. */
ok(shouldEnsureClientMembershipsOnOpen(base) === true, 'открытый черновик без абонемента → догрузка')

ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, hasSummary: true }) === false,
  'плитка уже посчитана → в облако не идём',
)
ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, membershipsCount: 2 }) === false,
  'строки есть, плитка пустая по правилу абонемента → не догрузка',
)
ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, online: false }) === false,
  'офлайн-планшет не ходит в сеть',
)
ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, isAdmin: true }) === false,
  'админ грузит абонементы своим контуром',
)
ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, status: 'completed' }) === false,
  'завершённая тренировка не тянет абонементы',
)
ok(shouldEnsureClientMembershipsOnOpen({ ...base, clientId: '  ' }) === false, 'без клиента нет догрузки')

/* Пауза между попытками: иначе слабая сеть зала получит поток запросов. */
ok(
  shouldEnsureClientMembershipsOnOpen({ ...base, lastAttemptAt: 1_000_000 - 5_000 }) === false,
  'только что пробовали → ждём',
)
ok(
  shouldEnsureClientMembershipsOnOpen({
    ...base,
    lastAttemptAt: 1_000_000 - TRAINING_MEMBERSHIP_ENSURE_RETRY_MS - 1,
  }) === true,
  'пауза вышла → пробуем снова',
)

/* «Закончить»: одна попытка догрузки прежде, чем сказать тренеру «нет абонемента». */
const debitBase = { planOk: false, clientId: 'c1', online: true, alreadyEnsured: false }
ok(shouldEnsureClientMembershipsBeforeDebit(debitBase) === true, 'списывать не с чего → одна догрузка')
ok(
  shouldEnsureClientMembershipsBeforeDebit({ ...debitBase, planOk: true }) === false,
  'абонемент найден → сеть не трогаем',
)
ok(
  shouldEnsureClientMembershipsBeforeDebit({ ...debitBase, alreadyEnsured: true }) === false,
  'вторая попытка не вешает «Закончить» на сеть',
)
ok(
  shouldEnsureClientMembershipsBeforeDebit({ ...debitBase, online: false }) === false,
  'офлайн: отказ сразу, без ожидания сети',
)

/* Контур на месте: страница действительно зовёт эти решения, а не осталась со старым поведением. */
const page = readFileSync(new URL('../src/pages/trainer/TrainingPage.jsx', import.meta.url), 'utf8')
ok(/shouldEnsureClientMembershipsOnOpen\(/.test(page), 'TrainingPage: догрузка при открытии')
ok(/shouldEnsureClientMembershipsBeforeDebit\(/.test(page), 'TrainingPage: догрузка перед списанием')
ok(/ensureTrainerMembershipsFresh\(/.test(page), 'TrainingPage: сервис догрузки')

const prefetch = readFileSync(
  new URL('../src/lib/trainer/trainingClientPrefetch.js', import.meta.url),
  'utf8',
)
ok(
  /prefetchedClientKeys\.delete\(key\)/.test(prefetch),
  'неудачный prefetch отпускает ключ (иначе следующий заход не пробует)',
)
ok(/force: true/.test(prefetch), 'точечная догрузка обходит общий cooldown')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-training-membership-ensure: all checks passed')
