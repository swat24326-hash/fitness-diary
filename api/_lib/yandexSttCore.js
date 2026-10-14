/**
 * Yandex SpeechKit, распознавание API v3 (асинхронное): только оно ставит знаки препинания и заглавные
 * (`literatureText`), синхронный v1 отдаёт «купите резинку средней жесткости» без точек. Без сети — для verify.
 */

export const YANDEX_STT_START_URL = 'https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync'
export const YANDEX_STT_RESULT_URL = 'https://stt.api.cloud.yandex.net/stt/v3/getRecognition'
export const YANDEX_OPERATION_URL = 'https://operation.api.cloud.yandex.net/operations'

/** @param {string} base64 MP3 голосового (до 5 минут — асинхронное распознавание берёт до 4 часов) */
export function buildYandexSttRequest(base64) {
  return {
    content: base64,
    recognitionModel: {
      model: 'general',
      audioFormat: { containerAudio: { containerAudioType: 'MP3' } },
      textNormalization: { textNormalization: 'TEXT_NORMALIZATION_ENABLED', profanityFilter: false, literatureText: true },
      languageRestriction: { restrictionType: 'WHITELIST', languageCode: ['ru-RU'] },
    },
  }
}

/** Ответ getRecognition — подряд идущие JSON-объекты (по строке или с отступами); режем по скобкам вне строк. */
export function splitJsonStream(text) {
  const out = []
  const s = String(text ?? '')
  let depth = 0
  let start = -1
  let inString = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (inString) {
      if (ch === '\\') i += 1
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0) {
        try {
          out.push(JSON.parse(s.slice(start, i + 1)))
        } catch {
          /* битый кусок пропускаем */
        }
      }
    }
  }
  return out
}

const firstText = (part) => String(part?.alternatives?.[0]?.text ?? '').trim()

/**
 * Текст фразы: у каждого куска (finalIndex) берём нормализованный вариант с пунктуацией, если пришёл, иначе сырой.
 * @returns {string}
 */
export function parseYandexSttResult(text) {
  const byIndex = new Map()
  for (const item of splitJsonStream(text)) {
    const r = item?.result ?? item
    if (String(r?.channelTag ?? '0') !== '0') continue
    const refined = r?.finalRefinement
    if (refined) {
      const t = firstText(refined.normalizedText)
      if (t) byIndex.set(String(refined.finalIndex ?? r?.audioCursors?.finalIndex ?? byIndex.size), { text: t, refined: true })
      continue
    }
    const t = firstText(r?.final)
    const key = String(r?.audioCursors?.finalIndex ?? byIndex.size)
    if (t && !byIndex.get(key)?.refined) byIndex.set(key, { text: t, refined: false })
  }
  return [...byIndex.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
