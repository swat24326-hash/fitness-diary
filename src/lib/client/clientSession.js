/**
 * Сессия клиента в /me: отдельно от входа сотрудника (другие ключи localStorage, свои токены).
 * Последний удачный ответ /api/client-me храним, чтобы без сети показать данные «на дату».
 */
import { fetchWithAppTimeout } from '../networkReachability.js'

const SESSION_KEY = 'fd_client_session_v1'
const CACHE_KEY = 'fd_client_me_cache_v1'
const FETCH_MS = 15_000

export class ClientSessionGoneError extends Error {}

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим Safari — живём без кэша */
  }
}

export function readClientSession() {
  const s = readJson(SESSION_KEY)
  return s?.access_token && s?.refresh_token ? s : null
}

export function hasClientSession() {
  return readClientSession() != null
}

function saveSession(session) {
  writeJson(SESSION_KEY, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Number(session.expires_at) || 0,
  })
}

export function clearClientSession() {
  writeJson(SESSION_KEY, null)
  writeJson(CACHE_KEY, null)
}

export function readClientMeCache() {
  return readJson(CACHE_KEY)
}

export const CLIENT_OFFLINE_RU = 'Нет связи с сервером — проверьте интернет'

/** fetch бросает «Failed to fetch» / таймаут — клиенту показываем по-русски. */
async function request(path, init) {
  try {
    const res = await fetchWithAppTimeout(`${window.location.origin}${path}`, { cache: 'no-store', ...init }, FETCH_MS)
    const data = await res.json().catch(() => ({}))
    return { res, data }
  } catch {
    throw new Error(CLIENT_OFFLINE_RU)
  }
}

function postAuth(body) {
  return request('/api/client-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Погасить ссылку-приглашение. Ошибки — понятным русским текстом. */
export async function redeemClientInvite(token) {
  const { res, data } = await postAuth({ action: 'redeem', token })
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Не удалось войти — попросите в клубе новую ссылку')
  clearClientSession()
  saveSession(data.session)
  return data.client ?? null
}

async function validAccessToken() {
  const s = readClientSession()
  if (!s) throw new ClientSessionGoneError()
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token
  const { res, data } = await postAuth({ action: 'refresh', refresh_token: s.refresh_token })
  if (res.status === 401) {
    clearClientSession()
    throw new ClientSessionGoneError(data?.error)
  }
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Сервер не ответил — попробуйте позже')
  saveSession({ ...data.session })
  return data.session.access_token
}

async function clientMeRequest(init = {}, failRu) {
  const token = await validAccessToken()
  const { res, data } = await request('/api/client-me', {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    clearClientSession()
    throw new ClientSessionGoneError(data?.error)
  }
  if (!res.ok) throw new Error(data?.error || failRu)
  return data
}

/** GET /api/client-me; удачный ответ кладём в кэш. */
export async function fetchClientMe() {
  const data = await clientMeRequest({}, 'Не удалось загрузить данные')
  writeJson(CACHE_KEY, { data, saved_at: new Date().toISOString() })
  return data
}

/** POST /api/client-me { action: 'push-*' | 'handoff' } — напоминания на этот телефон, вход для значка iPhone. */
export function postClientMe(body) {
  return clientMeRequest(
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'Не получилось — попробуйте ещё раз',
  )
}

export async function logoutClient() {
  const s = readClientSession()
  clearClientSession()
  if (!s) return
  await postAuth({ action: 'logout', refresh_token: s.refresh_token }).catch(() => {})
}
