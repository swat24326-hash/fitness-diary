import { callIskraLlm } from './iskraLlmClient.js'
import { buildIskraSpeechScriptPayload, pickIskraSpeechScript } from './iskraSpeechScriptCore.js'

const SCRIPT_TIMEOUT_MS = 8_000

/**
 * Модель переписывает ответ «для уха»; не успела или ошиблась — исходный текст, голос не молчит.
 * @param {string} text
 * @returns {Promise<{ text: string, source: 'llm' | 'raw' }>}
 */
export async function scriptIskraSpeech(text) {
  let timer
  try {
    const reply = await Promise.race([
      callIskraLlm(buildIskraSpeechScriptPayload(text)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('speech_script_timeout')), SCRIPT_TIMEOUT_MS)
      }),
    ])
    return pickIskraSpeechScript(reply?.text, text)
  } catch {
    return pickIskraSpeechScript('', text)
  } finally {
    clearTimeout(timer)
  }
}
