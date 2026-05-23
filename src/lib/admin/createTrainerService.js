import { getAccessTokenForAdminApi } from './adminApiClient'

const API_UNAVAILABLE_MSG =
  'На сайте ещё нет сервера создания тренеров (/api/create-trainer). Нужен новый деплой на Vercel (код с папкой api/) и переменная SUPABASE_SERVICE_ROLE_KEY. Edge Function из браузера часто не открывается (ошибка сети) — не используйте её.'

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function apiRouteMissing(res, contentType) {
  const ct = contentType || ''
  if (ct.includes('text/html')) return true
  if (res.status === 404 || res.status === 405) return true
  return false
}

function createTrainerApiUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/create-trainer`
  }
  return '/api/create-trainer'
}

/**
 * Создание тренера: POST на тот же домен (Vercel /api/create-trainer).
 * Edge Function не вызываем — из браузера к functions.supabase.co часто ERR_CONNECTION_RESET.
 */
export async function createTrainerForAdmin(body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) {
    return { data: null, error: new Error('Сессия истекла — войдите снова как администратор') }
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  let res
  try {
    res = await fetch(createTrainerApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    return {
      data: null,
      error: new Error(
        `Не удалось связаться с сервером приложения. ${e?.message ?? ''} Проверьте интернет и обновите страницу (Ctrl+F5).`,
      ),
    }
  }

  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)

  if (res.ok) {
    return { data, error: null }
  }

  if (apiRouteMissing(res, contentType)) {
    return { data: null, error: new Error(API_UNAVAILABLE_MSG) }
  }

  const msg = data?.error ? String(data.error) : `Ошибка сервера (${res.status})`
  return { data, error: new Error(msg) }
}