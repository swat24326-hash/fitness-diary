/**
 * Neural TTS ИСКРЫ через Edge Read Aloud (ru-RU-SvetlanaNeural / DmitryNeural).
 * Обход скрипучего Google в Chrome, где нет Microsoft Desktop.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const ISKRA_TTS_MAX_CHARS = 900

/**
 * @param {string} text
 * @param {'male'|'female'|string} [gender]
 */
export function resolveIskraNeuralVoice(gender = 'female') {
  return gender === 'male' ? 'ru-RU-DmitryNeural' : 'ru-RU-SvetlanaNeural'
}

/**
 * @param {string} text
 * @returns {string}
 */
export function truncateIskraTtsText(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (raw.length <= ISKRA_TTS_MAX_CHARS) return raw
  const cut = raw.slice(0, ISKRA_TTS_MAX_CHARS)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim()
}

/**
 * @param {string} text
 * @param {{ gender?: 'male'|'female'|string }} [opts]
 * @returns {Promise<{ ok: true, mime: string, base64: string, voice: string } | { ok: false, error: string }>}
 */
export async function synthesizeIskraNeuralTts(text, opts = {}) {
  const clean = truncateIskraTtsText(text)
  if (!clean) return { ok: false, error: 'empty_text' }

  const voice = resolveIskraNeuralVoice(opts.gender)
  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = await tts.toStream(clean)
    const chunks = []
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buf = Buffer.concat(chunks)
    if (!buf.length) return { ok: false, error: 'empty_audio' }
    return {
      ok: true,
      mime: 'audio/mpeg',
      base64: buf.toString('base64'),
      voice,
    }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message).slice(0, 200) : 'tts_failed' }
  }
}
