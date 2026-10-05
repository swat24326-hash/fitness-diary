/**
 * Свой Auth: хеш пароля и JWT без базы и без сети.
 * node scripts/verify-auth-own.mjs
 */
import bcrypt from 'bcryptjs'
import { parseAuthExport, planAuthHashImport } from '../api/_lib/authHashImportCore.js'
import {
  buildOwnSession,
  hashOwnPassword,
  isLegacyBcryptHash,
  isOwnAuthProvider,
  ownAuthEnvError,
  ownPasswordNeedsRehash,
  ownRefreshDenial,
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

  // Пароли из Supabase Auth (bcrypt) после переезда R3
  const legacy = bcrypt.hashSync('old-supabase-pass', 10)
  ok(isLegacyBcryptHash(legacy), 'хеш Supabase (bcrypt $2a$10$) распознан')
  ok(await verifyOwnPassword('old-supabase-pass', legacy), 'старый пароль Supabase подходит')
  ok(!(await verifyOwnPassword('wrong', legacy)), 'чужой пароль к хешу Supabase не подходит')
  ok(ownPasswordNeedsRehash(legacy) && !ownPasswordNeedsRehash(hash), 'bcrypt → пересохранить в scrypt; scrypt не трогать')
  const tooCostly = legacy.replace(/^\$2([aby])\$10\$/, '$2$1$13$')
  ok(!isLegacyBcryptHash(tooCostly) && !(await verifyOwnPassword('old-supabase-pass', tooCostly)), 'bcrypt дороже 12 отвергается (не грузим сервер)')
  ok(!isLegacyBcryptHash('') && !isLegacyBcryptHash('supabase-auth'), 'пустой хеш и метка — не bcrypt')

  {
    const b1 = bcrypt.hashSync('p1', 4)
    const b2 = bcrypt.hashSync('p2', 4)
    const users = [
      { id: 'u1', email: 'a@x.ru', login: 'anna', password_hash: 'supabase-auth' },
      { id: 'u2', email: 'B@x.ru', login: 'boris', password_hash: 'supabase-auth' },
      { id: 'u3', email: 'c@x.ru', login: 'cyril', password_hash: hash },
      { id: 'u4', email: 'd@x.ru', login: 'dina', password_hash: null },
    ]
    const plan = planAuthHashImport(
      [
        { id: 'u1', email: 'a@x.ru', encrypted_password: b1 },
        { id: 'auth-old-b', email: 'b@X.ru', encrypted_password: b2 },
        { id: 'u3', email: 'c@x.ru', encrypted_password: b1 },
        { id: 'u9', email: 'nobody@x.ru', encrypted_password: b1 },
        { id: 'u4', email: 'd@x.ru', encrypted_password: '' },
      ],
      users,
    )
    const byUser = Object.fromEntries(plan.updates.map((u) => [u.userId, u]))
    ok(byUser.u1?.via === 'id' && byUser.u1.passwordHash === b1, 'перенос по id')
    ok(byUser.u2?.via === 'email' && byUser.u2.passwordHash === b2, 'старая строка (id ≠ auth.uid) — по почте без учёта регистра')
    ok(!byUser.u3 && plan.keptOwn === 1, 'пароль, заданный уже на новом сервере, не перезаписывается')
    ok(plan.unmatchedAuth.length === 1 && plan.noHash === 1, 'чужие и пустые строки auth пропущены и посчитаны')
    ok(plan.staffWithoutPassword.join(',') === 'dina', 'кому пароль задать вручную — по логину')
    const csv = parseAuthExport(`id,email,encrypted_password\nu1,a@x.ru,${b1}\n`)
    ok(csv.length === 1 && csv[0].encrypted_password === b1, 'CSV из SQL Editor читается')
  }

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

  const liveUser = async (id) => ({ row: { id, email: 'a@b.c', is_active: true }, error: null })
  const refreshed = await refreshOwnSession(session.refresh_token, liveUser)
  ok(refreshed.session?.access_token && refreshed.session.user.id === 'user-1', 'refresh выдаёт новую сессию')
  const deleted = await refreshOwnSession(session.refresh_token, async () => ({ row: null, error: null }))
  ok(!deleted.session && /войдите снова/.test(deleted.error), 'удалённый тренер: refresh не продлевает')
  const blocked = await refreshOwnSession(session.refresh_token, async (id) => ({
    row: { id, email: 'a@b.c', is_active: false },
    error: null,
  }))
  ok(!blocked.session && /заблокирована/.test(blocked.error), 'заблокированный тренер: refresh не продлевает')
  const dbDown = await refreshOwnSession(session.refresh_token, async () => ({ row: null, error: 'база недоступна' }))
  ok(!dbDown.session && dbDown.error === 'база недоступна', 'ошибка базы: сессию не выдаём вслепую')
  ok(dbDown.transient === true && !deleted.transient && !blocked.transient, 'ошибка базы — временная, удалён/блок — нет')
  ok(ownRefreshDenial({ id: 'x' }) === null && ownRefreshDenial({ id: 'x', is_active: null }) === null, 'is_active не задан → можно')
  ok(ownRefreshDenial(null) === 'missing' && ownRefreshDenial({ id: 'x', is_active: false }) === 'blocked', 'missing / blocked')

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
    { loadUserById: liveUser },
  )
  const refreshBody = JSON.parse(refreshRes.body)
  ok(refreshRes.statusCode === 200 && refreshBody.access_token && refreshBody.refresh_token, 'POST /auth/v1/token refresh')

  const refreshDbDownRes = mockRes()
  const prevConsoleError = console.error
  console.error = () => {}
  try {
    await handleAuthV1(
      {
        method: 'POST',
        url: '/auth/v1/token?grant_type=refresh_token',
        headers: {},
        query: { grant_type: 'refresh_token' },
        body: { refresh_token: session.refresh_token },
      },
      refreshDbDownRes,
      { loadUserById: async () => ({ row: null, error: 'база недоступна' }) },
    )
  } finally {
    console.error = prevConsoleError
  }
  ok(refreshDbDownRes.statusCode === 503, 'refresh при сбое базы → 503: клиент повторит, сессию не сотрёт')

  const refreshBadRes = mockRes()
  await handleAuthV1(
    {
      method: 'POST',
      url: '/auth/v1/token?grant_type=refresh_token',
      headers: {},
      query: { grant_type: 'refresh_token' },
      body: { refresh_token: 'garbage' },
    },
    refreshBadRes,
    { loadUserById: liveUser },
  )
  ok(refreshBadRes.statusCode === 400, 'битый refresh → 400 (войти заново)')
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
