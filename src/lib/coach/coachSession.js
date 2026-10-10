/**
 * Сессия телефона тренера (/coach): отдельно от планшета — свои ключи localStorage, свой номер устройства
 * (coach-…), свой пропуск. Данных клуба на телефоне не храним: нет сети — нет данных.
 */
import { DEVICE_ID_HEADER, deviceRequestHeaders } from '../deviceIdentityCore.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

const SESSION_KEY = 'fd_coach_session_v1'
const DEVICE_KEY = 'fd_coach_device_id'
const FETCH_MS = 15_000

export const COACH_OFFLINE_RU = 'Нет сети — данные на телефоне не хранятся'

export class CoachSessionGoneError extends Error {}
export class CoachPendingError extends Error {}

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readJson(key) {
  try {
    const raw = storage()?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, value) {
  try {
    if (value == null) storage()?.removeItem(key)
    else storage()?.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим Safari — вход живёт до закрытия вкладки */
  }
}

function newCoachDeviceId() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  return `coach-${uuid}`
}

/** Номер этого телефона; живёт, пока не очищены данные сайта. */
export function coachDeviceId() {
  const saved = storage()?.getItem(DEVICE_KEY)
  if (saved && /^coach-[A-Za-z0-9-]{10,58}$/.test(saved)) return saved
  const id = newCoachDeviceId()
  try {
    storage()?.setItem(DEVICE_KEY, id)
  } catch {
    /* без localStorage телефон будет новым при каждом входе */
  }
  return id
}

function deviceHeaders() {
  return deviceRequestHeaders(coachDeviceId(), navigator.maxTouchPoints)
}

export function readCoachSession() {
  const s = readJson(SESSION_KEY)
  return s?.access_token && s?.refresh_token ? s : null
}

export function hasCoachSession() {
  return readCoachSession() != null
}

function saveSession(session) {
  writeJson(SESSION_KEY, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Number(session.expires_at) || 0,
  })
}

export function clearCoachSession() {
  writeJson(SESSION_KEY, null)
}

async function request(path, init) {
  try {
    const res = await fetchWithAppTimeout(`${window.location.origin}${path}`, { cache: 'no-store', ...init }, FETCH_MS)
    const data = await res.json().catch(() => ({}))
    return { res, data }
  } catch {
    throw new Error(COACH_OFFLINE_RU)
  }
}

function postAuth(body) {
  return request('/api/coach-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...deviceHeaders() },
    body: JSON.stringify(body),
  })
}

/** Вход логином и паролем планшета. Телефон ждёт «Разрешить» — CoachPendingError. */
export async function signInCoach(login, password) {
  const { res, data } = await postAuth({ action: 'sign-in', login, password })
  if (data?.code === 'device_pending') throw new CoachPendingError(data.error)
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Не удалось войти')
  saveSession(data.session)
  return data.user ?? null
}

async function validAccessToken() {
  const s = readCoachSession()
  if (!s) throw new CoachSessionGoneError()
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token
  const { res, data } = await postAuth({ action: 'refresh', refresh_token: s.refresh_token })
  if (res.status === 401) {
    clearCoachSession()
    throw new CoachSessionGoneError(data?.error)
  }
  if (!res.ok || !data?.session) throw new Error(data?.error || 'Сервер не ответил — попробуйте позже')
  saveSession(data.session)
  return data.session.access_token
}

/**
 * GET/POST /api/coach. 401 — вход закончился (отозван телефон, блок, смена пароля); 403 — нет доступа к данным.
 * @param {Record<string, string>} [query]
 * @param {object} [body]
 */
export async function coachRequest(query = {}, body = null) {
  const token = await validAccessToken()
  const qs = new URLSearchParams(query).toString()
  const { res, data } = await request(`/api/coach${qs ? `?${qs}` : ''}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      [DEVICE_ID_HEADER]: coachDeviceId(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) {
    clearCoachSession()
    throw new CoachSessionGoneError(data?.error)
  }
  if (!res.ok) throw new Error(data?.error || 'Не получилось — попробуйте ещё раз')
  return data
}

export async function signOutCoach() {
  const s = readCoachSession()
  clearCoachSession()
  if (!s) return
  await postAuth({ action: 'sign-out', refresh_token: s.refresh_token }).catch(() => {})
}
