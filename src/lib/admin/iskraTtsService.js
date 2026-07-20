import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

/**
 * Neural TTS (Svetlana/Dmitry) через admin-data — обход Google в Chrome.
 * @param {string} text
 * @param {'male'|'female'|string} [gender]
 * @returns {Promise<{ ok: true, mime: string, base64: string, voice: string } | { ok: false, error?: string }>}
 */
export async function fetchIskraNeuralTts(text, gender = 'female') {
  const token = await getAccessTokenForAdminApi()
  if (!token) return { ok: false, error: 'no_session' }

  try {
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?action=iskra-tts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          text: String(text ?? '').slice(0, 1200),
          gender: gender === 'male' ? 'male' : 'female',
        }),
      },
      25_000,
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok || !data?.audio_base64) {
      return { ok: false, error: String(data?.error ?? `http_${res.status}`) }
    }
    return {
      ok: true,
      mime: String(data.mime || 'audio/mpeg'),
      base64: String(data.audio_base64),
      voice: String(data.voice || ''),
    }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'network' }
  }
}
