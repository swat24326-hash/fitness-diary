/**
 * Голос ИСКРЫ: текст «для уха» через модель, Yandex SpeechKit, текст для серверного голоса.
 */
import {
  buildIskraSpeechScriptPayload,
  clipIskraSpeechInput,
  ISKRA_SPEECH_SCRIPT_MAX_INPUT,
  pickIskraSpeechScript,
} from '../api/_lib/iskraSpeechScriptCore.js'
import {
  buildYandexTtsForm,
  resolveYandexTtsVoice,
  truncateYandexTtsText,
  YANDEX_TTS_MAX_CHARS,
} from '../api/_lib/yandexTtsCore.js'
import { prepareTextForNeuralSpeech, splitSpeechChunks } from '../src/lib/geminiAnalyticsSpeech.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

const reply = 'По данным: ПНК за месяц — 14 при плане 20 (выполнение 70%).'

const payload = buildIskraSpeechScriptPayload(reply)
const system = payload.systemInstruction.parts[0].text
ok(/падеж/.test(system), 'промпт требует согласования падежей')
ok(/ПНК — потенциальные новые клиенты/.test(system), 'глоссарий ПНК в промпте')
ok(/ЗП — зарплата/.test(system), 'глоссарий ЗП в промпте')
ok(payload.contents[0].role === 'user' && payload.contents[0].parts[0].text === reply, 'текст ответа уходит как user')
ok(payload.generationConfig.temperature <= 0.2, 'низкая температура — без фантазий')
ok(payload.responseMode === 'standard', 'standard: короткий ответ не считается обрывом')

const long = `${'Клиентов стало больше. '.repeat(100)}`
const clipped = clipIskraSpeechInput(long)
ok(clipped.length <= ISKRA_SPEECH_SCRIPT_MAX_INPUT, 'вход модели ограничен')
ok(clipped.endsWith('.'), 'обрезка по концу предложения')

const spoken =
  'По данным, потенциальных новых клиентов за месяц четырнадцать при плане двадцати, выполнение семьдесят процентов.'
ok(pickIskraSpeechScript(spoken, reply).source === 'llm', 'нормальный пересказ — берём ответ модели')
ok(pickIskraSpeechScript('**Ок**', reply).source === 'raw', 'слишком короткий ответ модели — исходник')
ok(pickIskraSpeechScript('', reply).text === reply, 'нет ответа модели — озвучиваем исходник')
ok(pickIskraSpeechScript('слово '.repeat(400), reply).source === 'raw', 'раздутый ответ модели — исходник')
ok(!/[*#`]/.test(pickIskraSpeechScript(`**${spoken}**`, reply).text), 'разметка вычищена')

ok(resolveYandexTtsVoice('female') === 'alena', 'женский голос — alena')
ok(resolveYandexTtsVoice('male') === 'filipp', 'мужской голос — filipp')
const form = buildYandexTtsForm('Привет', { folderId: 'b1gtest', gender: 'male' })
ok(form.get('voice') === 'filipp' && form.get('lang') === 'ru-RU', 'форма: голос и язык')
ok(form.get('format') === 'mp3' && form.get('folderId') === 'b1gtest', 'форма: mp3 и каталог')
ok(truncateYandexTtsText('Слово. '.repeat(1000)).length <= YANDEX_TTS_MAX_CHARS, 'лимит SpeechKit 5000 символов')

const neural = prepareTextForNeuralSpeech('**ПНК** — 14 из 20, см. [отчёт](https://x.ru/a)\n- пункт')
ok(/14/.test(neural) && /20/.test(neural), 'серверному голосу — цифры как есть')
ok(/ПНК/.test(neural), 'серверному голосу — сокращения как есть (расшифрует модель)')
ok(!/[*[\]()]|https?:/.test(neural), 'серверному голосу — без разметки и ссылок')
ok(/отчёт/.test(neural) && /пункт/.test(neural), 'текст ссылок и пунктов сохранён')

const longReply =
  'По данным за октябрь ПНК 14 при плане 20, это 70%. Выручка 450 тыс ₽ из 600 тыс ₽. ДК 312, УК 41. ' +
  'У 3 тренеров нет тренировок за 5 дней. Рекомендую обзвонить 41 УК до пятницы и поставить Иванову 6 пробных. ' +
  'Ближайшие продления: 27 абонементов до 15 октября, из них 9 годовые.'
const parts = splitSpeechChunks(longReply, 220)
ok(parts.length >= 2, 'длинный ответ серверному голосу — кусками, первый звучит быстро')
ok(parts.every((p) => p.length <= 220), 'кусок не длиннее 220 символов')
ok(parts.join(' ').replace(/\s+/g, ' ') === longReply, 'куски без потерь текста')

if (failed) {
  console.error(`verify-iskra-speech-script: ${failed} fail`)
  process.exit(1)
}
console.log('verify-iskra-speech-script: ok')
