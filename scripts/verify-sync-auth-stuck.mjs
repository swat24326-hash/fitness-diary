/**
 * INC-2026-10-05-01: очередь висит из‑за сессии → тренер видит «войдите снова», а не «проверьте сеть»;
 * журнал неуспешных ответов API на ВМ без токенов и query.
 */
import { isQueueAuthStuck, isSyncAuthError, syncQueueLeftMessage } from '../src/lib/syncAuthStuck.js'
import {
  formatPortableResponseLog,
  shouldLogPortableResponse,
  userIdFromBearerForLog,
} from '../api/_lib/portableRequestLog.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(isSyncAuthError({ status: 401 }), '401 — сессия')
ok(isSyncAuthError({ last_error: 'Нет токена авторизации' }), '«Нет токена» в очереди — сессия')
ok(isSyncAuthError({ error: 'Сессия истекла — выйдите и войдите снова' }), 'ошибка pull — сессия')
ok(!isSyncAuthError({ last_error: 'Failed to fetch' }), 'сеть — не сессия')
ok(!isSyncAuthError(null), 'пусто — не сессия')

ok(isQueueAuthStuck([{ last_error: 'timeout' }, { last_error: 'Нет сессии — войдите снова' }]), 'одна запись с сессией → stuck')
ok(isQueueAuthStuck([], { status: 401 }), 'последняя ошибка 401 → stuck')
ok(!isQueueAuthStuck([{ last_error: 'Failed to fetch' }], { error: 'timeout' }), 'только сеть → не stuck')

const authMsg = syncQueueLeftMessage(5, true)
ok(/Сессия истекла/.test(authMsg) && /войдите снова/.test(authMsg) && !/проверьте сеть/.test(authMsg), 'текст: войти, а не сеть')
ok(/5 записей/.test(authMsg) && /сохранены/.test(authMsg), 'текст: сколько и что данные целы')
ok(/проверьте сеть/.test(syncQueueLeftMessage(1, false)), 'сеть — прежний текст')

ok(!shouldLogPortableResponse('/api/push-record', 200), '200 не логируем')
ok(shouldLogPortableResponse('/api/push-record', 401), '401 API логируем')
ok(shouldLogPortableResponse('/auth/v1/token', 400), 'отказ refresh логируем')
ok(!shouldLogPortableResponse('/assets/index.js', 404), 'статику не логируем')

const payload = Buffer.from(JSON.stringify({ sub: '11111111-2222-3333-4444-555555555555' })).toString('base64url')
ok(userIdFromBearerForLog(`Bearer x.${payload}.sig`) === '11111111-2222-3333-4444-555555555555', 'id из JWT')
ok(userIdFromBearerForLog('Bearer garbage') === null && userIdFromBearerForLog(undefined) === null, 'мусор → null')
const evil = Buffer.from(JSON.stringify({ sub: 'x\n[api] fake' })).toString('base64url')
ok(userIdFromBearerForLog(`Bearer x.${evil}.sig`) === null, 'не-UUID sub не попадает в лог')

const line = formatPortableResponseLog({ method: 'POST', pathname: '/api/push-record', status: 401, ms: 12.4, userId: null })
ok(line === '[api] POST /api/push-record 401 12ms', 'формат строки')

if (failed) {
  console.error(`verify-sync-auth-stuck: ${failed} failed`)
  process.exit(1)
}
console.log('verify-sync-auth-stuck: ok')
