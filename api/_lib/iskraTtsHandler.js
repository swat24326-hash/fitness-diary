import { sendJson } from './adminSupabase.js'
import { resolveIskraLlmConfig } from './iskraLlmCore.js'
import { scriptIskraSpeech } from './iskraSpeechScript.js'
import { synthesizeIskraNeuralTts } from './iskraTtsEdgeCore.js'
import { synthesizeYandexTts } from './yandexTtsClient.js'

/**
 * POST admin-data?action=iskra-tts — текст «для уха» + серверный голос
 * (Yandex SpeechKit в РФ-контуре, Edge вне его), не Google из браузера.
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleIskraTtsPost(ctx, res, body) {
  void ctx
  const gender = body?.gender === 'male' ? 'male' : 'female'
  const text = String(body?.text ?? '').trim()
  if (!text) {
    sendJson(res, 400, { ok: false, error: 'empty_text' })
    return
  }
  const script = await scriptIskraSpeech(text)
  const cfg = resolveIskraLlmConfig(process.env)
  const result =
    cfg.provider === 'yandex'
      ? await synthesizeYandexTts(cfg, script.text, gender)
      : await synthesizeIskraNeuralTts(script.text, { gender })
  if (!result.ok) {
    sendJson(res, 502, { ok: false, error: result.error || 'tts_failed' })
    return
  }
  sendJson(res, 200, {
    ok: true,
    mime: result.mime,
    audio_base64: result.base64,
    voice: result.voice,
    script: script.source,
  })
}
