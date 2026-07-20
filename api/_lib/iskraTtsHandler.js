import { sendJson } from './adminSupabase.js'
import { synthesizeIskraNeuralTts } from './iskraTtsEdgeCore.js'

/**
 * POST admin-data?action=iskra-tts — neural озвучка (Svetlana/Dmitry), не Google Chrome.
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleIskraTtsPost(ctx, res, body) {
  void ctx
  const text = String(body?.text ?? '')
  const gender = body?.gender === 'male' ? 'male' : 'female'
  const result = await synthesizeIskraNeuralTts(text, { gender })
  if (!result.ok) {
    sendJson(res, 502, { ok: false, error: result.error || 'tts_failed' })
    return
  }
  sendJson(res, 200, {
    ok: true,
    mime: result.mime,
    audio_base64: result.base64,
    voice: result.voice,
  })
}
