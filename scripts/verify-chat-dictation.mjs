/**
 * Голосовой ввод в переписке: звук → 16 кГц PCM, громкость для волны, таймер, вставка текста на место курсора,
 * проверка звука до SpeechKit, разбор ответа SpeechKit v3, лимит на человека, ответы обработчика.
 * node scripts/verify-chat-dictation.mjs
 */
import {
  CHAT_DICTATION_BARS,
  CHAT_DICTATION_BUSY_RU,
  CHAT_DICTATION_EMPTY_RU,
  CHAT_DICTATION_FAILED_RU,
  CHAT_DICTATION_MAX_BYTES,
  CHAT_DICTATION_RATE,
  CHAT_DICTATION_SHORT_RU,
  CHAT_DICTATION_UNAVAILABLE_RU,
  chatDictationLevel,
  checkDictationAudio,
  downsamplePcm,
  formatDictationTime,
  insertDictation,
  pcm16Bytes,
  pushDictationLevel,
} from '../src/lib/chat/chatDictationCore.js'
import { buildYandexSttRequest, parseYandexSttResult, splitJsonStream } from '../api/_lib/yandexSttCore.js'
import { createChatDictateLimiter } from '../api/_lib/chat/chatDictateLimitCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const pcmOfSec = (sec) => b64(new Uint8Array(Math.round(CHAT_DICTATION_RATE * 2 * sec)))

console.log('Звук')
const down = downsamplePcm(new Float32Array(48000).fill(0.5), 48000)
ok(down.length === 16000, '48 кГц → 16 кГц: секунда остаётся секундой')
ok(Math.abs(down[100] - 0.5) < 1e-6, 'уровень сигнала не меняется')
ok(downsamplePcm(new Float32Array(10), 16000).length === 10, 'уже 16 кГц — без изменений')
ok(downsamplePcm(null, 48000).length === 0, 'пусто — пусто, без падения')
const pcm = pcm16Bytes(Float32Array.from([1, -1, 0, 2]))
const view = new DataView(pcm.buffer)
ok(pcm.length === 8, '16 бит — 2 байта на отсчёт')
ok(view.getInt16(0, true) === 32767 && view.getInt16(2, true) === -32768, 'край шкалы, младший байт первым')
ok(view.getInt16(6, true) === 32767, 'перегруз обрезается, а не переворачивается')

console.log('Волна и таймер')
ok(chatDictationLevel(new Float32Array(100)) === 0, 'тишина — пустой столбик')
ok(chatDictationLevel(new Float32Array(100).fill(0.05)) > 0.3, 'тихая речь заметна')
ok(chatDictationLevel(new Float32Array(100).fill(1)) === 1, 'громко — не выше столбика')
let levels = []
for (let i = 0; i < CHAT_DICTATION_BARS + 5; i += 1) levels = pushDictationLevel(levels, i)
ok(levels.length === CHAT_DICTATION_BARS && levels.at(-1) === CHAT_DICTATION_BARS + 4, 'новые справа, старые уезжают')
ok(formatDictationTime(7.9) === '0:07' && formatDictationTime(65) === '1:05', 'таймер «0:07»')

console.log('Текст в поле')
ok(insertDictation('', 0, 0, 'Купите резинку.').text === 'Купите резинку.', 'пустое поле — как сказали')
const end = insertDictation('Привет!', 7, 7, 'Купите резинку.')
ok(end.text === 'Привет! Купите резинку.' && end.caret === end.text.length, 'после фразы — пробел, заглавная остаётся, курсор в конце')
ok(insertDictation('Возьмите', 8, 8, 'Среднюю жёсткость').text === 'Возьмите среднюю жёсткость', 'посреди фразы — с маленькой')
ok(insertDictation('Возьмите', 8, 8, 'ПЗ на месяц').text === 'Возьмите ПЗ на месяц', 'аббревиатуру не трогаем')
const mid = insertDictation('Купите завтра', 7, 7, 'резинку')
ok(mid.text === 'Купите резинку завтра' && mid.caret === 'Купите резинку '.length, 'на место курсора — пробелы с обеих сторон')
ok(insertDictation('Купите СТАРОЕ завтра', 7, 13, 'новое').text === 'Купите новое завтра', 'выделенное заменяется')
ok(insertDictation('Ок', 0, 0, 'да').text === 'да Ок', 'в начало — пробел перед старым текстом')
ok(insertDictation('Ок', null, null, 'да').text === 'Ок да', 'курсора нет — в конец')
ok(insertDictation('Ок', 2, 2, '   ').text === 'Ок', 'ничего не распознали — поле не трогаем')
const cut = insertDictation('a'.repeat(8), 8, 8, 'очень длинный текст', 12)
ok(cut.text.length <= 12 && cut.cut, 'упёрлись в лимит символов — обрезано, флаг для подсказки')

console.log('Звук до SpeechKit')
ok(checkDictationAudio(pcmOfSec(2)).ok, '2 секунды — берём')
ok(checkDictationAudio(pcmOfSec(0.2)).error === CHAT_DICTATION_SHORT_RU, 'слишком коротко — не платим за распознавание')
const big = checkDictationAudio(b64(new Uint8Array(CHAT_DICTATION_MAX_BYTES + 2)))
ok(!big.ok && big.status === 413, 'длиннее лимита — 413')
ok(checkDictationAudio('не base64!').status === 400, 'мусор — 400')
ok(checkDictationAudio(123).status === 400, 'не строка — 400')
ok(checkDictationAudio(b64(new Uint8Array(16001))).status === 400, 'нечётное число байт — не 16 бит')

console.log('Запрос и ответ SpeechKit v3')
const req = buildYandexSttRequest('AAAA', 16000)
ok(req.content === 'AAAA' && req.recognitionModel.audioFormat.rawAudio.sampleRateHertz === '16000', 'PCM 16 кГц, звук в запросе')
ok(req.recognitionModel.textNormalization.literatureText === true, 'со знаками препинания и заглавными')
ok(req.recognitionModel.languageRestriction.languageCode[0] === 'ru-RU', 'русский')
const stream = [
  { result: { channelTag: '0', audioCursors: { finalIndex: '0' }, final: { alternatives: [{ text: 'купите резинку' }] } } },
  { result: { channelTag: '0', finalRefinement: { finalIndex: '0', normalizedText: { alternatives: [{ text: 'Купите резинку.' }] } } } },
  { result: { channelTag: '0', audioCursors: { finalIndex: '1' }, final: { alternatives: [{ text: 'средней жесткости' }] } } },
  { result: { channelTag: '0', finalRefinement: { finalIndex: '1', normalizedText: { alternatives: [{ text: 'Средней жёсткости!' }] } } } },
  { result: { channelTag: '0', eouUpdate: { timeMs: '7400' } } },
]
ok(parseYandexSttResult(stream.map((x) => JSON.stringify(x)).join('\n')) === 'Купите резинку. Средней жёсткости!', 'по строке: куски по порядку, с пунктуацией')
ok(parseYandexSttResult(stream.map((x) => JSON.stringify(x, null, 2)).join('\n')) === 'Купите резинку. Средней жёсткости!', 'с отступами (как в документации) — тоже')
ok(parseYandexSttResult(JSON.stringify(stream[0])) === 'купите резинку', 'нормализованного нет — берём сырой текст')
ok(parseYandexSttResult('') === '', 'тишина — пусто')
ok(splitJsonStream('{"a":"}{"}{"b":1}').length === 2, 'скобки внутри строк не режут объект')

console.log('Лимит на человека')
const lim = createChatDictateLimiter({ limit: 2, windowMs: 1000 })
ok(lim.take('u:1', 0) && lim.take('u:1', 10), 'первые попытки — можно')
ok(!lim.take('u:1', 20), 'сверх лимита — нельзя')
ok(lim.take('u:2', 20), 'у другого человека свой лимит')
ok(lim.take('u:1', 1500), 'окно прошло — снова можно')

console.log('Обработчик')
process.env.YANDEX_FOLDER_ID = ''
process.env.YANDEX_LLM_API_KEY = ''
process.env.YANDEX_LLM_AUTH = ''
const { dictateChatAudio } = await import('../api/_lib/chat/chatDictateHandler.js')
let calls = 0
const fine = async () => {
  calls += 1
  return { ok: true, text: 'Купите резинку.' }
}
const off = await dictateChatAudio('u:a', pcmOfSec(1), fine)
ok(off.status === 503 && off.body.error === CHAT_DICTATION_UNAVAILABLE_RU && calls === 0, 'SpeechKit не настроен — «пока недоступен», без вызова')
process.env.YANDEX_FOLDER_ID = 'folder'
process.env.YANDEX_LLM_AUTH = 'metadata'
const bad = await dictateChatAudio('u:a', 'xx', fine)
ok(bad.status === 400 && calls === 0, 'плохой звук — отказ до платного распознавания')
const good = await dictateChatAudio('u:a', pcmOfSec(1), fine)
ok(good.status === 200 && good.body.text === 'Купите резинку.', 'распознали — текст для поля')
const empty = await dictateChatAudio('u:b', pcmOfSec(1), async () => ({ ok: true, text: '' }))
ok(empty.status === 422 && empty.body.error === CHAT_DICTATION_EMPTY_RU, 'тишина — «Не расслышал»')
const denied = await dictateChatAudio('u:c', pcmOfSec(1), async () => ({ ok: false, error: 'stt_start_http_403' }))
ok(denied.status === 503 && denied.body.error === CHAT_DICTATION_UNAVAILABLE_RU, 'у сервера нет роли SpeechKit — «пока недоступен»')
const broke = await dictateChatAudio('u:c', pcmOfSec(1), async () => ({ ok: false, error: 'stt_timeout' }))
ok(broke.status === 502 && broke.body.error === CHAT_DICTATION_FAILED_RU, 'сбой / долго — «попробуйте ещё раз»')
let last
for (let i = 0; i < 25; i += 1) last = await dictateChatAudio('u:spam', pcmOfSec(1), fine)
ok(last.status === 429 && last.body.error === CHAT_DICTATION_BUSY_RU, 'жмут без конца — «подождите минуту»')

if (failed) {
  console.error(`\nverify-chat-dictation: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-dictation: ok')
