/**
 * Подменный сервер для автотестов экрана: Auth, `/api/*`, `/rest/v1` в памяти.
 * Не ходит в сеть; состояние — обычные массивы, тест читает их напрямую.
 */

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

export function fakeJwt(claims) {
  const now = Math.floor(Date.now() / 1000)
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iat: now, exp: now + 3600, ...claims })}.e2e`
}

function authUser(u) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    app_metadata: { provider: 'email', role: u.role },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function sessionFor(u) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: fakeJwt({ sub: u.id, email: u.email, role: 'authenticated' }),
    refresh_token: `refresh-${u.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: authUser(u),
  }
}

function profileOf(u) {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    login: u.login,
    phone: null,
    club_id: u.club_id,
    uses_tablet: true,
  }
}

function userFromBearer(state, headers) {
  const raw = String(headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const part = raw.split('.')[1]
  if (!part) return null
  try {
    const { sub } = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return state.users.find((u) => u.id === sub) ?? null
  } catch {
    return null
  }
}

function matchesFilter(row, column, expr) {
  const value = row[column]
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot)
  const arg = expr.slice(dot + 1)
  if (op === 'eq') return String(value ?? '') === arg
  if (op === 'neq') return String(value ?? '') !== arg
  if (op === 'is') return arg === 'null' ? value == null : String(value) === arg
  if (op === 'in') {
    const list = arg.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
    return list.includes(String(value ?? ''))
  }
  if (op === 'ilike') {
    const re = new RegExp(`^${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
    return re.test(String(value ?? ''))
  }
  return true
}

const REST_RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns'])

function restSelect(state, table, searchParams) {
  let rows = state[table] ?? []
  for (const [key, expr] of searchParams) {
    if (REST_RESERVED.has(key) || !expr.includes('.')) continue
    rows = rows.filter((r) => matchesFilter(r, key, expr))
  }
  return rows
}

function upsertRow(state, table, row) {
  if (!state[table]) state[table] = []
  const list = state[table]
  const idx = list.findIndex((r) => r.id === row.id)
  const stamped = { ...row, updated_at: new Date().toISOString() }
  if (idx >= 0) list[idx] = { ...list[idx], ...stamped }
  else list.push({ created_at: stamped.updated_at, ...stamped })
  return idx >= 0 ? list[idx] : list[list.length - 1]
}

function applyPush(state, rec) {
  const table = String(rec.table_name ?? '')
  const op = String(rec.operation ?? '')
  const data = rec.data ?? {}
  const id = data.id ?? rec.remote_id
  state.pushLog.push({ table, op, id, data })
  if (op === 'delete') {
    state[table] = (state[table] ?? []).filter((r) => r.id !== id)
    return { ok: true }
  }
  return { ok: true, record: upsertRow(state, table, { ...data, id }) }
}

function trainerPull(state, user) {
  const clients = state.clients.filter((c) => c.trainer_id === user.id && !c.archived_at)
  const ids = new Set(clients.map((c) => c.id))
  const byClient = (rows) => rows.filter((r) => ids.has(r.client_id))
  return {
    club_id: user.club_id,
    clients,
    memberships: byClient(state.memberships),
    trainings: byClient(state.trainings),
    health_cards: byClient(state.health_cards),
    body_measurements: [],
    client_weight_entries: [],
    pnk_funnel_events: [],
    sale_clips: [],
    client_hall_lifecycle: [],
    trainer_schedule_entries: [],
    outreach_templates: null,
  }
}

/**
 * @param {{ users: object[], clients?: object[], memberships?: object[], trainings?: object[], [k: string]: unknown }} seed
 */
export function createFakeBackend(seed) {
  const state = {
    clubs: [],
    clients: [],
    memberships: [],
    trainings: [],
    health_cards: [],
    membership_types: [],
    exercises: [],
    challenges: [],
    ...structuredClone(seed),
    pushLog: [],
    requestLog: [],
  }
  const backend = { state, cloudDown: false, clientMe: null }

  /**
   * @param {{ method: string, path: string, searchParams: URLSearchParams, headers: Record<string,string>, body: any }} req
   * @returns {{ status: number, json?: unknown, headers?: Record<string,string> } | null} null = сеть оборвана
   */
  backend.handle = (req) => {
    state.requestLog.push(`${req.method} ${req.path}`)
    if (backend.cloudDown) return null
    const { method, path, searchParams, headers, body } = req

    if (path === '/api/auth-sign-in' && method === 'POST') {
      const login = String(body?.login ?? '').toLowerCase()
      const u = state.users.find((x) => x.login === login || x.email === login)
      if (!u || body?.password !== u.password) return { status: 400, json: { error: 'Неверный логин или пароль' } }
      return { status: 200, json: { session: sessionFor(u), user: authUser(u), profile: profileOf(u) } }
    }
    if (path === '/auth/v1/token' && method === 'POST') {
      const u =
        searchParams.get('grant_type') === 'password'
          ? state.users.find((x) => x.email === body?.email && x.password === body?.password)
          : state.users.find((x) => `refresh-${x.id}` === body?.refresh_token)
      return u ? { status: 200, json: sessionFor(u) } : { status: 400, json: { error: 'invalid_grant' } }
    }
    if (path === '/auth/v1/logout') return { status: 204 }

    if (path === '/api/client-auth' || path === '/api/client-me') {
      return backend.clientMe ? backend.clientMe(req) : { status: 404, json: { error: 'not configured' } }
    }

    const user = userFromBearer(state, headers)
    if (path === '/auth/v1/user') {
      return user ? { status: 200, json: authUser(user) } : { status: 401, json: { msg: 'no session' } }
    }
    if (path.startsWith('/api/') && !user) return { status: 401, json: { error: 'Нет сессии' } }

    if (path === '/api/me-profile') return { status: 200, json: { profile: profileOf(user) } }
    if (path === '/api/trainer-pull') return { status: 200, json: trainerPull(state, user) }
    if (path === '/api/push-record' && method === 'POST') {
      return { status: 200, json: applyPush(state, body) }
    }
    if (path === '/api/push-records' && method === 'POST') {
      const results = (body?.records ?? []).map((rec, index) => ({ index, ...applyPush(state, rec) }))
      return { status: 200, json: { results } }
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length)
      const rows = restSelect(state, table, searchParams)
      const single = String(headers.accept ?? '').includes('vnd.pgrst.object')
      if (single) {
        return rows.length === 1 ? { status: 200, json: rows[0] } : { status: 406, json: { code: 'PGRST116', message: 'no rows' } }
      }
      return { status: 200, json: rows, headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } }
    }
    if (path === '/api/admin-data' && searchParams.get('action') === 'exercises') {
      return { status: 200, json: { exercises: state.exercises, count: state.exercises.length } }
    }
    if (path.startsWith('/api/')) {
      state.requestLog.push(`  (заглушка) ${path}?${searchParams}`)
      return { status: 200, json: {} }
    }
    return { status: 404, json: { error: 'fake: unknown route' } }
  }

  return backend
}
