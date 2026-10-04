import { callGeminiGenerateContent } from './geminiApiClient.js'
import { resolveIskraLlmConfig } from './iskraLlmCore.js'
import { callYandexLlm } from './yandexLlmClient.js'

/**
 * @param {object} payload from buildGeminiGeneratePayload
 * @returns {Promise<{ text: string, model: string, provider: 'yandex' | 'gemini' }>}
 */
export async function callIskraLlm(payload, env = process.env) {
  const cfg = resolveIskraLlmConfig(env)
  if (cfg.provider === 'yandex') {
    const r = await callYandexLlm(cfg, payload)
    return { text: r.text, model: r.model, provider: 'yandex' }
  }
  const r = await callGeminiGenerateContent(cfg.apiKey, payload)
  return { text: r.text, model: r.model, provider: 'gemini' }
}
