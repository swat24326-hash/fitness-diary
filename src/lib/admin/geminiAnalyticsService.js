import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { formatGeminiUserError } from './geminiAnalyticsPrompt.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

/**
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   gender: 'male' | 'female',
 *   userMessage: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   comparePrevious?: boolean,
 * }} opts
 */
export async function postGeminiAnalytics(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=gemini-analytics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      club_id: opts.clubId,
      year: opts.year,
      month: opts.month,
      gender: opts.gender === 'female' ? 'female' : 'male',
      user_message: opts.userMessage,
      messages: opts.messages ?? [],
      compare_previous: opts.comparePrevious === true,
    }),
  })

  const data = await parseJsonResponse(res)
  if (!res.ok) {
    throw new Error(formatGeminiUserError(data?.error ?? `Ошибка сервера (${res.status})`))
  }
  return data
}
