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
import { logoutOwnSession, refreshOwnSession, revokeAllOwnSessions, verifyBearerOwn } from '../api/_lib/authPortOwn.js'
import { handleAuthV1 } from '../api/_lib/authV1Handler.js'
import { ownLogoutScope, ownSessionDenial } from '../api/_lib/authSessionsCore.js'
import { AUTH_PROFILE_BLOCKED_RU, isCallerProfileBlocked } from '../api/_lib/authCallerProfileCore.js'
import { isUnrecoverablePushError } from '../src/lib/syncFlushResult.js'

/** auth_sessions в памяти вместо базы. */
function memorySessions({ failCreate = false, failLoad = false } = {}) {
  const rows = new Map()
  let n = 0
  return {
    rows,
    touched: [],
    async create(userId) {
      if (failCreate) return { sid: null, error: 'relation "auth_sessions" does not exist' }
      n += 1
      const id = `sid-${n}`
      rows.set(id, { id, user_id: userId, revoked_at: null })
      return { sid: id, error: null }
    },
    async load(sid) {
      if (failLoad) return { row: null, error: 'база недоступна' }
      return { row: rows.get(sid) ?? null, error: null }
    },
    async touch(sid) {
      this.touched.push(sid)
      return { error: null }
    },
    async revoke(sid, userId) {
      const r = rows.get(sid)
      if (r && r.user_id === userId) r.revoked_at = 'now'
      return { error: null }
    },
    async revokeAllForUser(userId) {
      for (const r of rows.values()) if (r.user_id === userId) r.revoked_at = 'now'
      return { error: null }
    },
  }
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
}

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
  const mem = memorySessions()
  const refreshed = await refreshOwnSession(session.refresh_token, liveUser, mem)
  ok(refreshed.session?.access_token && refreshed.session.user.id === 'user-1', 'refresh выдаёт новую сессию')
  const deleted = await refreshOwnSession(session.refresh_token, async () => ({ row: null, error: null }), mem)
  ok(!deleted.session && /войдите снова/.test(deleted.error), 'удалённый тренер: refresh не продлевает')
  const blocked = await refreshOwnSession(
    session.refresh_token,
    async (id) => ({ row: { id, email: 'a@b.c', is_active: false }, error: null }),
    mem,
  )
  ok(!blocked.session && /заблокирована/.test(blocked.error), 'заблокированный тренер: refresh не продлевает')
  const dbDown = await refreshOwnSession(session.refresh_token, async () => ({ row: null, error: 'база недоступна' }), mem)
  ok(!dbDown.session && dbDown.error === 'база недоступна', 'ошибка базы: сессию не выдаём вслепую')
  ok(dbDown.transient === true && !deleted.transient && !blocked.transient, 'ошибка базы — временная, удалён/блок — нет')
  ok(ownRefreshDenial({ id: 'x' }) === null && ownRefreshDenial({ id: 'x', is_active: null }) === null, 'is_active не задан → можно')
  ok(ownRefreshDenial(null) === 'missing' && ownRefreshDenial({ id: 'x', is_active: false }) === 'blocked', 'missing / blocked')

  // Сессии: «Выйти», отзыв админом, токены до 06.10 без sid
  {
    const s = memorySessions()
    const legacy = await refreshOwnSession(session.refresh_token, liveUser, s)
    const legacySid = jwtPayload(legacy.session.refresh_token).sid
    ok(legacySid === 'sid-1' && s.rows.has('sid-1'), 'токен без sid → на продлении заводится сессия')
    ok(jwtPayload(legacy.session.access_token).sid === legacySid, 'sid и в access')

    const again = await refreshOwnSession(legacy.session.refresh_token, liveUser, s)
    ok(again.session && jwtPayload(again.session.refresh_token).sid === legacySid, 'продление живой сессии сохраняет sid')
    ok(s.touched.includes(legacySid) && s.rows.size === 1, 'продление отмечает сессию, новую не плодит')

    const second = buildOwnSession({ id: 'user-1', email: 'a@b.c', sid: (await s.create('user-1')).sid }, SECRET)
    const out = await logoutOwnSession([legacy.session.refresh_token], 'local', s)
    ok(out.revoked && s.rows.get(legacySid).revoked_at, '«Выйти» отзывает свою сессию')
    const afterLogout = await refreshOwnSession(legacy.session.refresh_token, liveUser, s)
    ok(!afterLogout.session && /войдите снова/.test(afterLogout.error) && !afterLogout.transient, 'после «Выйти» refresh не продлевает (400, не 503)')
    ok((await refreshOwnSession(second.refresh_token, liveUser, s)).session, 'второе устройство при local-выходе остаётся')

    await logoutOwnSession([second.refresh_token], 'global', s)
    ok(!(await refreshOwnSession(second.refresh_token, liveUser, s)).session, 'global — все устройства')

    const expiredAccess = signOwnJwt({ sub: 'user-1', typ: 'access', sid: 'sid-9', iat: 1, exp: 2 }, SECRET)
    const third = buildOwnSession({ id: 'user-1', email: 'a@b.c', sid: (await s.create('user-1')).sid }, SECRET)
    const viaRefresh = await logoutOwnSession([third.refresh_token, expiredAccess], 'local', s)
    ok(viaRefresh.revoked, 'истёкший access не мешает: отзыв по refresh')
    ok(!(await logoutOwnSession(['garbage'], 'local', s)).revoked, 'мусорный токен ничего не отзывает')

    const foreign = buildOwnSession({ id: 'user-2', email: 'x@y.z', sid: 'sid-1' }, SECRET)
    ok(!(await refreshOwnSession(foreign.refresh_token, liveUser, s)).session, 'чужой sid не продлевает')

    const loadDown = await refreshOwnSession(third.refresh_token, liveUser, memorySessions({ failLoad: true }))
    ok(!loadDown.session && loadDown.transient, 'сбой базы на проверке сессии → временная ошибка (503)')

    const prevWarn = console.warn
    console.warn = () => {}
    const noTable = await refreshOwnSession(session.refresh_token, liveUser, memorySessions({ failCreate: true }))
    console.warn = prevWarn
    ok(noTable.session && !jwtPayload(noTable.session.refresh_token).sid, 'нет таблицы — вход не ломается (без sid)')

    const blockedSessions = memorySessions()
    const b = buildOwnSession({ id: 'user-1', email: 'a@b.c', sid: (await blockedSessions.create('user-1')).sid }, SECRET)
    await revokeAllOwnSessions('user-1', blockedSessions)
    ok(!(await refreshOwnSession(b.refresh_token, liveUser, blockedSessions)).session, 'блок / смена пароля админом отзывает все сессии')

    ok(ownSessionDenial(null, 'u') === 'missing' && ownSessionDenial({ id: 's', user_id: 'u', revoked_at: 'x' }, 'u') === 'revoked', 'denial: missing / revoked')
    ok(ownSessionDenial({ id: 's', user_id: 'u', revoked_at: null }, 'u') === null, 'denial: живая')
    ok(ownLogoutScope('global') === 'global' && ownLogoutScope('local') === 'local' && ownLogoutScope(undefined) === 'local', 'scope по умолчанию local')

    ok(isCallerProfileBlocked({ is_active: false }) && !isCallerProfileBlocked({ is_active: null }) && !isCallerProfileBlocked(null), 'API: блок только при is_active=false')
    ok(!isUnrecoverablePushError(403, AUTH_PROFILE_BLOCKED_RU), 'планшет не снимает очередь при «заблокирована»')
  }

  {
    const s = memorySessions()
    const live = buildOwnSession({ id: 'user-1', email: 'a@b.c', sid: (await s.create('user-1')).sid }, SECRET)
    const logoutRes = mockRes()
    await handleAuthV1(
      { method: 'POST', url: '/auth/v1/logout?scope=local', headers: {}, query: { scope: 'local' }, body: { refresh_token: live.refresh_token } },
      logoutRes,
      { sessions: s },
    )
    ok(logoutRes.statusCode === 204 && s.rows.get('sid-1').revoked_at, 'POST /auth/v1/logout → 204 и отзыв')
    const badRes = mockRes()
    await handleAuthV1({ method: 'POST', url: '/auth/v1/logout', headers: {}, query: {}, body: {} }, badRes, { sessions: s })
    ok(badRes.statusCode === 204, 'logout без токена всё равно 204 (выход на планшете не блокируем)')
  }

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
    { loadUserById: liveUser, sessions: memorySessions() },
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
      { loadUserById: async () => ({ row: null, error: 'база недоступна' }), sessions: memorySessions() },
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
    { loadUserById: liveUser, sessions: memorySessions() },
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
