/**
 * Сессия клиента в /me: отдельно от входа сотрудника (другие ключи localStorage, свои токены).
 * Последний удачный ответ /api/client-me храним, чтобы без сети показать данные «на дату».
 */
import { fetchWithAppTimeout } from '../networkReachability.js'
import { CHAT_VIDEO_FAILED_RU } from '../chat/chatVideoCore.js'
import { CHAT_VIDEO_FETCH_MS, readApiBody, videoContentType } from '../chat/chatVideoTransport.js'
import { clearScreenCacheApp, registerScreenCacheGuard } from '../screenCache/screenCacheStore.js'
import { shouldWipeClientLocalOnRedeem } from './clientSessionClearCore.js'

const SESSION_KEY = 'fd_client_session_v1'
const CACHE_KEY = 'fd_client_me_cache_v1'
/** Задания и рационы, открытые клиентом, — чтобы в магазине без сети посмотреть ужин (clientPlansService.js). */
export const CLIENT_PLANS_CACHE_KEY = 'fd_client_plans_v1'
const FETCH_MS = 15_000

export class ClientSessionGoneError extends Error {}
export { shouldWipeClientLocalOnRedeem }

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

/** Сессия умерла сама: только токены. Кэш /me и переписка на телефоне остаются до «Выйти» или входа другого человека. */
export function dropClientTokens() {
  writeJson(SESSION_KEY, null)
}

/** «Выйти» или смена человека: стереть токены и всё сохранённое этого приложения на телефоне. */
export function clearClientSession() {
  void clearScreenCacheApp('client')
  writeJson(SESSION_KEY, null)
  writeJson(CACHE_KEY, null)
  writeJson(CLIENT_PLANS_CACHE_KEY, null)
}

registerScreenCacheGuard('client', hasClientSession)

export function readClientMeCache() {
  return readJson(CACHE_KEY)
}

/** Поправить сохранённый ответ /api/client-me на месте (например, погасить «Новое» у открытого задания). */
export function patchClientMeCache(patch) {
  const cache = readJson(CACHE_KEY)
  if (!cache?.data) return
  const data = patch(cache.data)
  if (data !== cache.data) writeJson(CACHE_KEY, { ...cache, data })
}

/** Число на вкладке «Сообщения» в кэше /me — чтобы другие экраны не рисовали старую единичку. */
export function writeClientChatAttention(count) {
  const next = Math.max(0, Math.floor(Number(count) || 0))
  patchClientMeCache((data) => (Number(data.chat_attention) === next ? data : { ...data, chat_attention: next }))
}

/** Открыли один непрочитанный диалог. Список потом запишет точное число. */
export function noteClientChatRead() {
  const current = Number(readClientMeCache()?.data?.chat_attention) || 0
  if (current > 0) writeClientChatAttention(current - 1)
}

export const CLIENT_OFFLINE_RU = 'Нет связи с сервером — проверьте интернет'

/** Метка операции в адресе — только для журнала скорости API на сервере ([api-timing]); сервер её не читает. */
function timingQuery(action) {
  return typeof action === 'string' && action ? { t: action } : null
}

/** fetch бросает «Failed to fetch» / таймаут — клиенту показываем по-русски. */
async function request(path, init, timeoutMs = FETCH_MS) {
  try {
    const res = await fetchWithAppTimeout(`${window.location.origin}${path}`, { cache: 'no-store', ...init }, timeoutMs)
    const data = await readApiBody(res)
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
  const prevId = readClientMeCache()?.data?.client?.id ?? null
  const { res, data } = await postAuth({ action: 'redeem', token })
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Не удалось войти — попросите в клубе новую ссылку')
  const nextId = data.client?.id ?? null
  if (shouldWipeClientLocalOnRedeem(prevId, nextId)) clearClientSession()
  else dropClientTokens()
  saveSession(data.session)
  return data.client ?? null
}

async function validAccessToken() {
  const s = readClientSession()
  if (!s) throw new ClientSessionGoneError()
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token
  const { res, data } = await postAuth({ action: 'refresh', refresh_token: s.refresh_token })
  if (res.status === 401) {
    dropClientTokens()
    throw new ClientSessionGoneError(data?.error)
  }
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Сервер не ответил — попробуйте позже')
  saveSession({ ...data.session })
  return data.session.access_token
}

async function clientMeRequest(init = {}, failRu, { query = null, timeoutMs } = {}) {
  const token = await validAccessToken()
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const { res, data } = await request(
    `/api/client-me${qs}`,
    {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    },
    timeoutMs,
  )
  if (res.status === 401) {
    dropClientTokens()
    throw new ClientSessionGoneError(data?.error)
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || failRu), { status: res.status })
  return data
}

/** GET /api/client-me; удачный ответ кладём в кэш. */
export async function fetchClientMe() {
  const data = await clientMeRequest({}, 'Не удалось загрузить данные')
  writeJson(CACHE_KEY, { data, saved_at: new Date().toISOString() })
  return data
}

/** POST /api/client-me { action: 'push-*' | 'handoff' } — напоминания на этот телефон, вход для значка iPhone. */
export function postClientMe(body, { timeoutMs } = {}) {
  return clientMeRequest(
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    'Не получилось — попробуйте ещё раз',
    { timeoutMs, query: timingQuery(body?.action) },
  )
}

/** Видеокружок: тело — сам файл, куда и сколько секунд — в адресе (chatVideoTransport). */
export function postClientMeVideo(query, blob) {
  return clientMeRequest(
    { method: 'POST', headers: { 'Content-Type': videoContentType(blob) }, body: blob },
    CHAT_VIDEO_FAILED_RU,
    { query, timeoutMs: CHAT_VIDEO_FETCH_MS },
  )
}

/** Одна своя завершённая тренировка для окна просмотра (без заметок — режет сервер). */
export async function fetchClientTraining(id) {
  const data = await postClientMe({ action: 'training', id })
  return data.training
}

export async function logoutClient() {
  const s = readClientSession()
  clearClientSession()
  if (!s) return
  await postAuth({ action: 'logout', refresh_token: s.refresh_token }).catch(() => {})
}
