import { yandexLlmAuthHeader } from './iskraLlmCore.js'
import { metadataIamToken } from './yandexIamToken.js'
import { buildYandexTtsForm, resolveYandexTtsVoice, YANDEX_TTS_URL } from './yandexTtsCore.js'

/**
 * @param {{ auth: 'api_key' | 'metadata', apiKey: string, folderId: string }} cfg
 * @param {string} text
 * @param {'male'|'female'|string} gender
 * @returns {Promise<{ ok: true, mime: string, base64: string, voice: string } | { ok: false, error: string }>}
 */
export async function synthesizeYandexTts(cfg, text, gender) {
  try {
    const iamToken = cfg.auth === 'metadata' ? await metadataIamToken() : ''
    const res = await fetch(YANDEX_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: yandexLlmAuthHeader(cfg, iamToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildYandexTtsForm(text, { folderId: cfg.folderId, gender }),
      signal: AbortSignal.timeout(20_000),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    if (!res.ok) {
      return { ok: false, error: `speechkit_http_${res.status}` }
    }
    if (!buf.length) return { ok: false, error: 'empty_audio' }
    return { ok: true, mime: 'audio/mpeg', base64: buf.toString('base64'), voice: resolveYandexTtsVoice(gender) }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message).slice(0, 200) : 'tts_failed' }
  }
}
