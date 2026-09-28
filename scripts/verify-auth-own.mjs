/**
 * Свой Auth: хеш пароля и JWT без базы и без сети.
 * node scripts/verify-auth-own.mjs
 */
import {
  buildOwnSession,
  hashOwnPassword,
  isOwnAuthProvider,
  ownAuthEnvError,
  passwordHashForUsersRow,
  signOwnJwt,
  verifyOwnJwt,
  verifyOwnPassword,
} from '../api/_lib/authOwnCore.js'
import { refreshOwnSession, verifyBearerOwn } from '../api/_lib/authPortOwn.js'
import { handleAuthV1 } from '../api/_lib/authV1Handler.js'

const SECRET = 'verify-auth-own-secret-32chars-min'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

function mockRes() {
  return {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(payload) {
      this.body = payload == null ? '' : String(payload)
    },
  }
}

const prevProvider = process.env.AUTH_PROVIDER
const prevSecret = process.env.JWT_SECRET

try {
  delete process.env.AUTH_PROVIDER
  ok(!isOwnAuthProvider(), 'без флага это не свой Auth')
  ok(ownAuthEnvError() == null, 'секрет не требуется, пока флаг выключен')
  ok(passwordHashForUsersRow({ user: { id: '1' } }) === 'supabase-auth', 'метка Supabase, если хеша нет')

  const hash = await hashOwnPassword('secret-pass')
  ok(hash.startsWith('scrypt$16384$'), 'хеш scrypt')
  ok(await verifyOwnPassword('secret-pass', hash), 'верный пароль')
  ok(!(await verifyOwnPassword('other-pass', hash)), 'чужой пароль')
  ok(!(await verifyOwnPassword('secret-pass', 'supabase-auth')), 'метка supabase-auth не подходит')
  ok(!(await verifyOwnPassword('secret-pass', 'scrypt$1048576$8$1$aa$bb')), 'чужая стоимость scrypt отвергается')
  ok(passwordHashForUsersRow({ passwordHash: hash }) === hash, 'в users пишется хеш')

  process.env.AUTH_PROVIDER = 'own'
  delete process.env.JWT_SECRET
  ok(Boolean(ownAuthEnvError()), 'own без JWT_SECRET — ошибка')

  const off = mockRes()
  delete process.env.AUTH_PROVIDER
  await handleAuthV1({ method: 'POST', url: '/auth/v1/token', headers: {}, query: { grant_type: 'password' }, body: {} }, off)
  ok(off.statusCode === 404, 'без флага /auth/v1 закрыт')

  process.env.AUTH_PROVIDER = 'own'
  process.env.JWT_SECRET = SECRET
  ok(ownAuthEnvError() == null, 'own с секретом')

  const now = 1_700_000_000
  const token = signOwnJwt({ sub: 'user-1', email: 'a@b.c', typ: 'access', iat: now, exp: now + 10 }, SECRET)
  ok(verifyOwnJwt(token, SECRET, now + 5).payload?.sub === 'user-1', 'JWT читается')
  ok(verifyOwnJwt(`${token}x`, SECRET, now + 5).payload == null, 'подпись не подделать')
  ok(verifyOwnJwt(token, SECRET, now + 11).error, 'просроченный JWT')

  const session = buildOwnSession({ id: 'user-1', email: 'a@b.c' }, SECRET)
  ok(Boolean(session.access_token && session.refresh_token), 'сессия: access и refresh')
  ok(session.user.id === 'user-1' && !JSON.stringify(session.user).includes('scrypt$'), 'в сессии нет хеша')

  const access = await verifyBearerOwn(session.access_token)
  ok(access.user?.id === 'user-1' && !access.error, 'access проходит verifyBearer')
  const asRefresh = await verifyBearerOwn(session.refresh_token)
  ok(!asRefresh.user && asRefresh.error, 'refresh нельзя подставить вместо access')

  const refreshed = refreshOwnSession(session.refresh_token)
  ok(refreshed.session?.access_token && refreshed.session.user.id === 'user-1', 'refresh выдаёт новую сессию')

  const userRes = mockRes()
  await handleAuthV1(
    {
      method: 'GET',
      url: '/auth/v1/user',
      headers: { authorization: `Bearer ${session.access_token}` },
      query: {},
    },
    userRes,
  )
  const userBody = JSON.parse(userRes.body)
  ok(userRes.statusCode === 200 && userBody.id === 'user-1', 'GET /auth/v1/user')

  const refreshRes = mockRes()
  await handleAuthV1(
    {
      method: 'POST',
      url: '/auth/v1/token?grant_type=refresh_token',
      headers: {},
      query: { grant_type: 'refresh_token' },
      body: { refresh_token: session.refresh_token },
    },
    refreshRes,
  )
  const refreshBody = JSON.parse(refreshRes.body)
  ok(refreshRes.statusCode === 200 && refreshBody.access_token && refreshBody.refresh_token, 'POST /auth/v1/token refresh')
} finally {
  if (prevProvider == null) delete process.env.AUTH_PROVIDER
  else process.env.AUTH_PROVIDER = prevProvider
  if (prevSecret == null) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = prevSecret
}

if (failed) {
  console.error(`verify-auth-own: ${failed} failed`)
  process.exit(1)
}
console.log('verify-auth-own: ok')
