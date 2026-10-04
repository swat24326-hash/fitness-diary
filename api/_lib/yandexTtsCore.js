/**
 * Yandex SpeechKit (REST v1): голос ИСКРЫ из РФ-контура.
 * Edge Read Aloud (Microsoft) с ВМ в РФ отдаёт пустое аудио.
 */

export const YANDEX_TTS_URL = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize'
export const YANDEX_TTS_MAX_CHARS = 4900

/** @param {'male'|'female'|string} [gender] */
export function resolveYandexTtsVoice(gender = 'female') {
  return gender === 'male' ? 'filipp' : 'alena'
}

/** @param {string} text */
export function truncateYandexTtsText(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (raw.length <= YANDEX_TTS_MAX_CHARS) return raw
  const cut = raw.slice(0, YANDEX_TTS_MAX_CHARS)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim()
}

/**
 * @param {string} text
 * @param {{ folderId: string, gender?: string }} opts
 */
export function buildYandexTtsForm(text, opts) {
  return new URLSearchParams({
    text: truncateYandexTtsText(text),
    lang: 'ru-RU',
    voice: resolveYandexTtsVoice(opts.gender),
    format: 'mp3',
    folderId: opts.folderId,
  })
}
