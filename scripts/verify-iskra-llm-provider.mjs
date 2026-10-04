/**
 * ИСКРА: выбор поставщика модели (Yandex AI Studio / Gemini) и перевод запроса в OpenAI-формат.
 */
import {
  buildYandexChatRequest,
  extractYandexChatReply,
  formatYandexLlmUserError,
  isYandexLlmRetryable,
  resolveIskraLlmConfig,
  YANDEX_LLM_DEFAULT_MODELS,
} from '../api/_lib/iskraLlmCore.js'
import { isGeminiReplyIncomplete } from '../src/lib/admin/geminiAnalyticsPrompt.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

console.log('provider')
const yEnv = { YANDEX_LLM_API_KEY: 'k', YANDEX_FOLDER_ID: 'b1g' }
ok(resolveIskraLlmConfig({ GEMINI_API_KEY: 'g' }).provider === 'gemini', 'без ключа Яндекса — Gemini (как раньше)')
ok(resolveIskraLlmConfig(yEnv).provider === 'yandex', 'ключ + каталог Яндекса — Яндекс')
ok(resolveIskraLlmConfig({ YANDEX_LLM_API_KEY: 'k' }).provider === 'gemini', 'ключ без каталога — не Яндекс')
ok(resolveIskraLlmConfig({ ...yEnv, ISKRA_LLM_PROVIDER: 'gemini' }).provider === 'gemini', 'явный gemini перекрывает')
const cfg = resolveIskraLlmConfig(yEnv)
ok(cfg.models.join() === YANDEX_LLM_DEFAULT_MODELS.join(), 'модели по умолчанию: DeepSeek V4 Flash, затем YandexGPT')
const custom = resolveIskraLlmConfig({ ...yEnv, YANDEX_LLM_MODEL: 'yandexgpt-5.1' })
ok(custom.models[0] === 'yandexgpt-5.1' && custom.models.length === 2, 'YANDEX_LLM_MODEL — первой, без дубля')

console.log('request')
const payload = {
  systemInstruction: { parts: [{ text: 'Ты ИСКРА' }] },
  contents: [
    { role: 'user', parts: [{ text: 'Сколько ПНК?' }] },
    { role: 'model', parts: [{ text: '12' }] },
    { role: 'user', parts: [{ text: 'А ', }, { text: 'вчера?' }] },
    { role: 'user', parts: [{ text: '' }] },
  ],
}
const body = buildYandexChatRequest(payload, {
  folderId: 'b1g',
  model: 'deepseek-v4-flash',
  generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
})
ok(body.model === 'gpt://b1g/deepseek-v4-flash/latest', 'URI модели gpt://каталог/модель/latest')
ok(body.messages[0].role === 'system' && body.messages[0].content === 'Ты ИСКРА', 'системная инструкция — system')
ok(body.messages[2].role === 'assistant', 'role model → assistant')
ok(body.messages[3].content === 'А вчера?', 'части склеиваются')
ok(body.messages.length === 4, 'пустой ход не отправляем')
ok(body.temperature === 0.5 && body.max_tokens === 512, 'temperature и лимит токенов переносятся')
ok(body.reasoning_effort === 'none', 'DeepSeek без платных размышлений')
const ygpt = buildYandexChatRequest(payload, { folderId: 'b1g', model: 'yandexgpt-5.1' })
ok(!('reasoning_effort' in ygpt) && !('max_tokens' in ygpt), 'YandexGPT: без reasoning_effort, без пустых полей')

console.log('reply')
const cut = extractYandexChatReply({ choices: [{ message: { content: ' Текст ' }, finish_reason: 'length' }] })
ok(cut.text === 'Текст' && cut.finishReason === 'MAX_TOKENS', 'обрыв по лимиту = MAX_TOKENS')
ok(isGeminiReplyIncomplete(cut.text, cut.finishReason, 'brief'), 'обрыв запускает повтор как у Gemini')
ok(extractYandexChatReply({}).text === '', 'пустой ответ не падает')

console.log('errors')
ok(isYandexLlmRetryable(429, '') && isYandexLlmRetryable(503, ''), '429/5xx — следующая модель')
ok(isYandexLlmRetryable(404, ''), 'модели нет в каталоге — следующая')
ok(!isYandexLlmRetryable(401, '') && !isYandexLlmRetryable(400, 'bad'), 'ключ/запрос — не перебираем')
ok(/ключ Yandex AI Studio/.test(formatYandexLlmUserError(401, 'x')), '401 — понятный текст про ключ')
ok(formatYandexLlmUserError(400, 'x'.repeat(300)).length <= 220, 'длинная ошибка обрезается')

if (failed) {
  console.error(`\nverify-iskra-llm-provider: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-iskra-llm-provider: ok')
