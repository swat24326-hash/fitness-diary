/**
 * Вход значка на iPhone: Safari берёт одноразовое приглашение → start_url /me?h=… → значок гасит его через /me/join.
 * Без базы и сети — хранилище в памяти.
 * node scripts/verify-client-handoff.mjs
 */
import { readFileSync } from 'node:fs'
import { createAuthFailLimiter } from '../api/_lib/authRateLimitCore.js'
import { timingRouteLabel } from '../api/_lib/portableTimingLog.js'
import { hashInviteToken } from '../api/_lib/clientPortal/clientAuthCore.js'
import { createClientAuthHandler } from '../api/_lib/clientPortal/clientAuthHandler.js'
import {
  CLIENT_HANDOFF_TTL_MS,
  clientHandoffStartUrl,
  isClientHandoffToken,
} from '../api/_lib/clientPortal/clientHandoffCore.js'
import { handleClientHandoff } from '../api/_lib/clientPortal/clientHandoffHandler.js'
import { buildClientManifest } from '../api/_lib/clientPortal/clientManifestCore.js'
import {
  clientHandoffPageUrl,
  handoffLaunchAction,
  handoffTokenFromSearch,
  reusableHandoff,
  withHandoffManifest,
} from '../src/lib/client/clientHandoffCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const prevSecret = process.env.JWT_SECRET
process.env.JWT_SECRET = 'verify-client-handoff-secret-0123456789abcdef'

const CLUB = '11111111-1111-4111-8111-111111111111'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TOKEN = 'kLhQxSXUAtjLdQY5fKVmf2QRp373m1PE'
const NOW = Date.parse('2026-10-07T12:00:00Z')

function memoryStore() {
  const invites = new Map()
  const sessions = new Map()
  let n = 0
  const add = (row) => {
    n += 1
    invites.set(row.token_hash, { id: `inv-${n}`, used_at: null, ...row })
  }
  return {
    invites,
    async loadClient(id) {
      return id === CLIENT ? { id: CLIENT, name: 'Иванова Анна', club_id: CLUB, archived_at: null } : null
    },
    async createInvite({ clientId, clubId, tokenHash, createdBy, expiresAt }) {
      add({ client_id: clientId, club_id: clubId, token_hash: tokenHash, created_by: createdBy, expires_at: expiresAt })
    },
    async createHandoffInvite({ clientId, clubId, tokenHash, expiresAt }) {
      const nowIso = new Date().toISOString()
      for (const row of invites.values()) {
        if (row.client_id === clientId && row.created_by === null && !row.used_at) row.expires_at = nowIso
      }
      add({ client_id: clientId, club_id: clubId, token_hash: tokenHash, created_by: null, expires_at: expiresAt })
    },
    async loadInviteByHash(h) {
      return invites.get(h) ?? null
    },
    async markInviteUsed(id) {
      for (const row of invites.values()) {
        if (row.id === id && !row.used_at) {
          row.used_at = new Date().toISOString()
          return true
        }
      }
      return false
    },
    async createSession(clientId) {
      n += 1
      sessions.set(`sess-${n}`, { client_id: clientId, revoked_at: null })
      return `sess-${n}`
    },
  }
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    setHeader() {},
    end(chunk) {
      res.body = chunk ? JSON.parse(chunk) : null
    },
  }
  return res
}

async function handoff(store, ctx, nowMs = Date.now()) {
  const res = fakeRes()
  await handleClientHandoff(ctx, res, store, nowMs)
  return res
}

async function redeem(handler, token) {
  const res = fakeRes()
  await handler({ method: 'POST', headers: {}, remoteAddress: '10.0.0.1', body: { action: 'redeem', token } }, res)
  return res
}

try {
  // --- Сервер: start_url значка ---
  ok(isClientHandoffToken(TOKEN), 'токен приглашения узнаётся')
  ok(!isClientHandoffToken('short') && !isClientHandoffToken('a/b?c=d&e=fffffffffffffffffff'), 'мусор — не токен')
  ok(clientHandoffStartUrl(TOKEN) === `/me?h=${TOKEN}`, 'start_url с приглашением')
  ok(clientHandoffStartUrl('"><script>') === '/me', 'мусор в start_url не попадает')
  ok(buildClientManifest('FIT-CITY').start_url === '/me', 'manifest без входа — /me')
  const m = buildClientManifest('FIT-CITY', clientHandoffStartUrl(TOKEN))
  ok(m.start_url === `/me?h=${TOKEN}` && m.scope === '/me' && m.id === '/me/', 'manifest с входом: start_url в scope, id прежний')

  // --- Сервер: выдача и вход ---
  const store = memoryStore()
  const ctx = { clientId: CLIENT, sid: 'sess-0', client: { id: CLIENT, club_id: CLUB } }
  const r1 = await handoff(store, ctx, NOW)
  ok(r1.statusCode === 200 && isClientHandoffToken(r1.body?.token), 'handoff выдаёт токен')
  ok(CLIENT_HANDOFF_TTL_MS <= 2 * 3600e3, 'токен в адресе Safari живёт не дольше 2 часов')
  ok(Date.parse(r1.body.expires_at) === NOW + CLIENT_HANDOFF_TTL_MS, 'срок — от момента выдачи')
  const row1 = store.invites.get(hashInviteToken(r1.body.token))
  ok(row1?.client_id === CLIENT && row1.club_id === CLUB && row1.created_by === null, 'приглашение на себя, в свой клуб, без сотрудника')
  ok((await handoff(store, { ...ctx, client: { id: CLIENT, club_id: null } })).statusCode === 409, 'без клуба — 409')

  const staffTk = 'StaffInviteToken_0123456789abcdef'
  await store.createInvite({ clientId: CLIENT, clubId: CLUB, tokenHash: hashInviteToken(staffTk), createdBy: 'staff-1', expiresAt: new Date(Date.now() + 3600e3).toISOString() })
  const fresh = await handoff(store, ctx)
  const auth = createClientAuthHandler(store, createAuthFailLimiter({ perLoginIp: 50, perIp: 50, perLogin: Infinity }))
  ok((await redeem(auth, r1.body.token)).statusCode === 401, 'новый handoff гасит прежний')
  ok((await redeem(auth, fresh.body.token)).statusCode === 200, 'значок входит по свежему приглашению')
  ok((await redeem(auth, fresh.body.token)).statusCode === 401, 'второй раз тем же — нет')
  ok((await redeem(auth, staffTk)).statusCode === 200, 'ссылку из клуба handoff не трогает')

  // --- Токен не оседает в журналах сервера ---
  ok(!timingRouteLabel('/api/client-me', `?manifest=${CLUB}&h=${TOKEN}`).includes(TOKEN), 'журнал API пишет путь без ?h=')
  const caddyfile = readFileSync(new URL('./r3-https-vm.sh', import.meta.url), 'utf8')
  ok(!/^\s*log\b/m.test(caddyfile), 'Caddy без журнала запросов: ?h= не пишется на диск (включаете log — фильтруйте query)')

  // --- Клиент: адрес, manifest, запуск значка ---
  ok(handoffTokenFromSearch(`?h=${TOKEN}`) === TOKEN, 'токен из адреса')
  ok(handoffTokenFromSearch('?h=bad') === '' && handoffTokenFromSearch('') === '', 'мусор в адресе — пусто')
  ok(clientHandoffPageUrl(TOKEN) === `/me?h=${TOKEN}` && clientHandoffPageUrl('') === '/me', 'адрес для «На экран Домой»')
  const mu = `/api/client-me?manifest=${CLUB}`
  ok(withHandoffManifest(mu, TOKEN) === `${mu}&h=${TOKEN}`, 'manifest клуба с входом')
  ok(withHandoffManifest(mu, '') === mu && withHandoffManifest(null, TOKEN) === null, 'без токена / без клуба — как было')
  ok(handoffLaunchAction({ standalone: true, hasSession: false, token: TOKEN }) === 'redeem', 'значок без входа — входим')
  ok(handoffLaunchAction({ standalone: true, hasSession: true, token: TOKEN }) === 'strip', 'значок уже вошёл — только чистим адрес')
  ok(handoffLaunchAction({ standalone: false, hasSession: true, token: TOKEN }) === 'none', 'Safari: адрес не трогаем')
  ok(handoffLaunchAction({ standalone: true, hasSession: false, token: '' }) === 'none', 'без токена — ничего')
  ok(reusableHandoff({ token: TOKEN, expires_at: new Date(NOW + 5 * 3600e3).toISOString() }, NOW) === TOKEN, 'живой токен переиспользуем')
  ok(reusableHandoff({ token: TOKEN, expires_at: new Date(NOW + 30 * 60e3).toISOString() }, NOW) === null, 'меньше часа до конца — берём новый')
  ok(reusableHandoff({ token: 'x', expires_at: 'garbage' }, NOW) === null && reusableHandoff(null, NOW) === null, 'мусор — новый')
} finally {
  if (prevSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = prevSecret
}

if (failed) {
  console.error(`\nverify-client-handoff: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-handoff: OK')
