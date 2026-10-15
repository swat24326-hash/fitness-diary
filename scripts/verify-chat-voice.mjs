/**
 * Голосовые сообщения, как в Telegram: кодек телефона (выбор формата, тип по байтам), волна, таймер, жест
 * (отмена / без рук / нажатие), проверка загрузки (куски или MP3, размер, 1–300 с, обрезка), склейка в MP3 (ffmpeg),
 * метка «🎤 Голосовое», срок сутки, вид для экрана, запрос SpeechKit (MP3), лимит расшифровок, обработчики:
 * загрузка, звук, «→ Аа» (запуск, ожидание, готово, сбой).
 * node scripts/verify-chat-voice.mjs
 */
import {
  CHAT_VOICE_BARS,
  CHAT_VOICE_EXPIRED_RU,
  CHAT_VOICE_MAX_BYTES,
  CHAT_VOICE_MAX_PARTS,
  CHAT_VOICE_MAX_SEC,
  CHAT_VOICE_RECORD_BPS,
  CHAT_VOICE_SHORT_RU,
  CHAT_VOICE_TEXT_BUSY_RU,
  CHAT_VOICE_TEXT_UNAVAILABLE_RU,
  CHAT_VOICE_TTL_MS,
  CHAT_VOICE_UNAVAILABLE_RU,
  buildVoiceView,
  chatVoiceLabel,
  chatVoiceLevel,
  checkVoiceUpload,
  compressVoiceWave,
  formatVoiceTime,
  isMp3Header,
  isVoiceEnding,
  isVoiceExpired,
  isVoiceStorageKey,
  isVoiceTap,
  nextVoiceSpeed,
  normalizeVoiceTrim,
  normalizeVoiceWave,
  pcm16Samples,
  pickVoiceRecorderMime,
  sniffVoiceMime,
  voiceCancelProgress,
  voiceGesture,
  voiceSeekRatio,
  voiceStorageKey,
} from '../src/lib/chat/chatVoiceCore.js'
import { PORTABLE_MAX_BODY_BYTES_DEFAULT } from '../api/_lib/portableHostSecurityCore.js'
import { resolveChatOutgoing } from '../src/lib/chat/chatStickerCore.js'
import { nextChatOutgoingId } from '../src/lib/chat/chatDeliveryCore.js'
import { buildChatMessageView } from '../src/lib/chat/chatMessageCore.js'
import { buildYandexSttRequest, parseYandexSttResult, splitJsonStream } from '../api/_lib/yandexSttCore.js'
import { createChatVoiceTextLimiter } from '../api/_lib/chat/chatVoiceTextLimitCore.js'
import { voiceFfmpegArgs } from '../api/_lib/chat/chatVoiceTranscode.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const mp3Bytes = (n = 4000) => {
  const b = new Uint8Array(n)
  b[0] = 0xff
  b[1] = 0xf3
  return b
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const webmBytes = (n = 4000) => {
  const b = new Uint8Array(n)
  b.set([0x1a, 0x45, 0xdf, 0xa3])
  return b
}
const mp4Bytes = (n = 4000) => {
  const b = new Uint8Array(n)
  b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])
  return b
}
const wave = Array.from({ length: CHAT_VOICE_BARS }, (_, i) => i)
const upload = (over = {}) => ({ audio: b64(mp3Bytes()), sec: 7, wave, ...over })
const partsUpload = (over = {}) => ({ parts: [b64(webmBytes()), b64(webmBytes(3000))], sec: 7, wave, ...over })

console.log('Кодек телефона')
const supports = (list) => (m) => list.includes(m)
ok(pickVoiceRecorderMime(supports(['audio/webm;codecs=opus', 'audio/mp4'])) === 'audio/webm;codecs=opus', 'Chrome / Android — Opus')
ok(pickVoiceRecorderMime(supports(['audio/mp4'])) === 'audio/mp4', 'iPhone — MP4 (AAC)')
ok(pickVoiceRecorderMime(() => false) === null, 'браузер не пишет звук — null, кнопку не показываем')
ok(
  pickVoiceRecorderMime(() => {
    throw new Error('x')
  }) === null,
  'проверка формата упала — не падаем',
)
ok(sniffVoiceMime(webmBytes()) === 'audio/webm' && sniffVoiceMime(mp4Bytes()) === 'audio/mp4' && sniffVoiceMime(mp3Bytes()) === 'audio/mpeg', 'тип по байтам: WebM, MP4, MP3')
ok(sniffVoiceMime(Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0])) === 'audio/ogg', 'Ogg (Firefox)')
ok(sniffVoiceMime(new Uint8Array(40)) === null && sniffVoiceMime(null) === null, 'мусор — null')
ok((CHAT_VOICE_MAX_SEC * CHAT_VOICE_RECORD_BPS * 1.25) / 8 < CHAT_VOICE_MAX_BYTES, '5 минут с запасом 25 % на перебор битрейта влезают в лимит')
ok((CHAT_VOICE_MAX_BYTES * 4) / 3 + 20_000 < PORTABLE_MAX_BODY_BYTES_DEFAULT, 'в base64 с волной — под потолок тела запроса')

console.log('Склейка в MP3 (ffmpeg)')
const args = voiceFfmpegArgs(['/t/a', '/t/b'], null)
const graph = args[args.indexOf('-filter_complex') + 1]
ok(args.filter((a) => a === '-i').length === 2 && graph.includes('concat=n=2:v=0:a=1') && !graph.includes('atrim'), 'два куска — склейка по порядку, без обрезки')
ok(graph.includes('aresample=48000') && graph.includes('channel_layouts=mono'), 'каждый кусок → 48 кГц моно (гарнитура посреди записи не ломает склейку)')
ok(args.includes('libmp3lame') && args.at(-1) === 'pipe:1' && args.includes('-nostdin'), 'MP3 в ответ, ffmpeg ничего не ждёт с клавиатуры')
const cutGraph = voiceFfmpegArgs(['/t/a'], [1.5, 4])[voiceFfmpegArgs(['/t/a'], [1.5, 4]).indexOf('-filter_complex') + 1]
ok(cutGraph.includes('atrim=start=1.5:end=4') && cutGraph.includes('asetpts=PTS-STARTPTS'), 'обрезка — по секундам ручек, отсчёт с нуля')
ok(normalizeVoiceTrim(null) === null && normalizeVoiceTrim([1.234, 5]).join() === '1.23,5', 'обрезка: не тянули — null; секунды до сотых')
ok(normalizeVoiceTrim([3, 3.1]) === false && normalizeVoiceTrim([-1, 4]) === false && normalizeVoiceTrim('x') === false, 'обрезка: короче полсекунды, минус, мусор — отказ')
ok(normalizeVoiceTrim([0, CHAT_VOICE_MAX_SEC + 5]) === false, 'обрезка: дальше 5 минут — отказ')

console.log('Волна')
const pcm = pcm16Samples(Float32Array.from([1, -1, 0, 2]))
ok(pcm[0] === 32767 && pcm[1] === -32768 && pcm[3] === 32767, '16 бит: край шкалы, перегруз обрезается')
ok(chatVoiceLevel(new Float32Array(100)) === 0 && chatVoiceLevel(new Float32Array(100).fill(0.05)) > 0.3, 'тишина — 0, тихая речь заметна')
const comp = compressVoiceWave([0, 1, 0.5, 0.2], 2)
ok(comp.length === 2 && comp[0] === 100 && comp[1] === 50, 'сжатие волны: в столбике — самый громкий кусок')
ok(compressVoiceWave([]).length === CHAT_VOICE_BARS && compressVoiceWave([]).every((v) => v === 0), 'пустая запись — ровная волна')
ok(compressVoiceWave(Array(1000).fill(0.3)).length === CHAT_VOICE_BARS, 'длинная запись — всё равно 48 столбиков')
ok(normalizeVoiceWave(wave)?.length === CHAT_VOICE_BARS, 'волна от телефона — берём')
ok(normalizeVoiceWave([1, 2]) === null && normalizeVoiceWave('x') === null, 'не 48 столбиков — мусор')
ok(normalizeVoiceWave(Array(CHAT_VOICE_BARS).fill(500))[0] === 100, 'выше 100 — обрезаем')
ok(formatVoiceTime(7.9) === '0:07' && formatVoiceTime(299) === '4:59', 'таймер «0:07», «4:59»')
ok(chatVoiceLabel(42) === '🎤 Голосовое 0:42', 'метка в тексте сообщения')
ok(!isVoiceEnding(284) && isVoiceEnding(285), 'последние 15 с из 5 минут — красный таймер')

console.log('Жест, как в Telegram')
ok(voiceGesture(-10, -5) === 'hold', 'палец почти на месте — держит')
ok(voiceGesture(-95, 0) === 'cancel', 'влево за порог — отмена')
ok(voiceGesture(0, -80) === 'lock', 'вверх — без рук')
ok(voiceGesture(-60, -80) === 'hold', 'по диагонали к отмене — не блокируем случайно')
ok(voiceCancelProgress(-45) === 0.5 && voiceCancelProgress(20) === 0, '«‹ отмена» едет за пальцем, вправо — нет')
ok(isVoiceTap(120) && !isVoiceTap(600), 'короткое нажатие — подсказка, долгое — запись')
ok(nextVoiceSpeed(1) === 1.5 && nextVoiceSpeed(1.5) === 2 && nextVoiceSpeed(2) === 1, 'скорость 1x → 1.5x → 2x → 1x')
ok(voiceSeekRatio(50, 200) === 0.25 && voiceSeekRatio(-5, 200) === 0 && voiceSeekRatio(10, 0) === 0, 'перемотка по волне')

console.log('Загрузка')
ok(checkVoiceUpload(upload()).ok, 'MP3 7 с (старая версия приложения) — берём')
const pu = checkVoiceUpload(partsUpload({ trim: [1, 6] }))
ok(pu.ok && pu.parts.length === 2 && pu.bytes === 7000 && pu.trim.join() === '1,6', 'два куска и обрезка — берём, размер общий')
ok(checkVoiceUpload(partsUpload()).trim === null, 'не обрезали — trim: null')
ok(checkVoiceUpload(partsUpload({ trim: [5, 5.2] })).status === 400, 'битая обрезка — 400')
ok(checkVoiceUpload(partsUpload({ parts: [] })).status === 400 && checkVoiceUpload(partsUpload({ parts: [b64(webmBytes()), 'не base64!'] })).status === 400, 'пусто или мусор среди кусков — 400')
ok(checkVoiceUpload(partsUpload({ parts: Array(CHAT_VOICE_MAX_PARTS + 1).fill(b64(webmBytes(400))) })).status === 400, 'кусков сверх меры — 400')
ok(checkVoiceUpload(partsUpload({ parts: [b64(webmBytes(CHAT_VOICE_MAX_BYTES - 100)), b64(webmBytes(400))] })).status === 413, 'куски вместе больше 3,7 МБ — 413')
ok(checkVoiceUpload(upload({ sec: 0.3 })).error === CHAT_VOICE_SHORT_RU, 'короче секунды — «слишком коротко»')
ok(checkVoiceUpload(upload({ sec: CHAT_VOICE_MAX_SEC + 5 })).status === 413, 'дольше 5 минут — 413')
ok(checkVoiceUpload(upload({ audio: b64(mp3Bytes(CHAT_VOICE_MAX_BYTES + 10)) })).status === 413, 'больше 3,7 МБ — 413')
ok(checkVoiceUpload(upload({ audio: 'не base64!' })).status === 400, 'мусор — 400')
ok(checkVoiceUpload(upload({ audio: b64(new Uint8Array(30)) })).error === CHAT_VOICE_SHORT_RU, 'пара байт — «слишком коротко»')
ok(checkVoiceUpload(upload({ wave: [1] })).status === 400, 'без волны — 400')
ok(isMp3Header(mp3Bytes()) && isMp3Header(Uint8Array.from([0x49, 0x44, 0x33])), 'MP3: кадр или тег ID3')
ok(!isMp3Header(Uint8Array.from([0x52, 0x49, 0x46, 0x46])), 'WAV / mp4 — не MP3')
const v = resolveChatOutgoing(upload({ sec: 65 }))
ok(v.ok && v.body === '🎤 Голосовое 1:05' && v.voice?.sec === 65 && v.sticker === null, 'голосовое → текст «🎤 Голосовое 1:05» для превью и push')
ok(resolveChatOutgoing({ body: 'Привет' }).voice === null, 'обычный текст — без голоса')
ok(resolveChatOutgoing({ audio: 'xx', sec: 5, wave }).ok === false, 'битое голосовое — ошибка, не пустое сообщение')
ok(resolveChatOutgoing(partsUpload()).voice?.parts.length === 2, 'куски записи — голосовое')
const key = voiceStorageKey('client', UUID_A, UUID_B)
ok(key === `voice/c-${UUID_A}/${UUID_B}.mp3` && isVoiceStorageKey(key), 'файл: автор + номер отправки')
ok(!isVoiceStorageKey('../etc/passwd') && !isVoiceStorageKey(`voice/c-${UUID_A}/x.mp3`), 'чужой путь — не ключ')
const a1 = nextChatOutgoingId(null, 'k', upload())
ok(nextChatOutgoingId(a1, 'k', upload()) === a1, 'повтор той же записи после ошибки — тот же номер')
ok(nextChatOutgoingId(a1, 'k', upload({ audio: b64(mp3Bytes(4004)) })).id !== a1.id, 'другая запись — новый номер')
const p1 = nextChatOutgoingId(null, 'k', partsUpload())
ok(nextChatOutgoingId(p1, 'k', partsUpload()) === p1, 'куски: повтор той же записи — тот же номер')
ok(nextChatOutgoingId(p1, 'k', partsUpload({ trim: [1, 5] })).id !== p1.id, 'куски: обрезали иначе — новый номер')

console.log('Срок и вид для экрана')
const now = Date.parse('2026-10-13T12:00:00Z')
const hourAgo = new Date(now - 3600_000).toISOString()
const dayAgo = new Date(now - CHAT_VOICE_TTL_MS).toISOString()
ok(!isVoiceExpired(hourAgo, now) && isVoiceExpired(dayAgo, now) && isVoiceExpired('мусор', now), 'слушать — ровно сутки')
const row = { voice_key: key, voice_sec: 7, voice_wave: wave, voice_text: null, created_at: hourAgo }
const view = buildVoiceView(row, now)
ok(view.sec === 7 && view.text === null && view.expired === false && view.wave.length === CHAT_VOICE_BARS, 'свежее: длительность, волна, не расшифровано')
ok(!('key' in view) && !JSON.stringify(view).includes('voice/'), 'ключ хранилища наружу не отдаём')
ok(buildVoiceView({ ...row, created_at: dayAgo }, now).expired, 'старше суток — «удалено»')
ok(buildVoiceView({ ...row, voice_text: '' }, now).text === '', 'слов не разобрать — пустая строка, не null')
ok(buildVoiceView({ body: 'Привет' }, now) === null, 'текстовое сообщение — без голоса')
const msgView = buildChatMessageView({ id: '1', body: '🎤 Голосовое 0:07', author_side: 'client', ...row }, 'staff', new Map())
ok(msgView.voice?.sec === 7, 'лента отдаёт голосовое вместе с сообщением')

console.log('SpeechKit: MP3')
const req = buildYandexSttRequest('AAAA')
ok(req.content === 'AAAA' && req.recognitionModel.audioFormat.containerAudio.containerAudioType === 'MP3', 'MP3 целиком в запросе')
ok(req.recognitionModel.textNormalization.literatureText === true, 'со знаками препинания')
ok(req.recognitionModel.languageRestriction.languageCode[0] === 'ru-RU', 'русский')
const stream = [
  { result: { channelTag: '0', audioCursors: { finalIndex: '0' }, final: { alternatives: [{ text: 'купите резинку' }] } } },
  { result: { channelTag: '0', finalRefinement: { finalIndex: '0', normalizedText: { alternatives: [{ text: 'Купите резинку.' }] } } } },
  { result: { channelTag: '0', audioCursors: { finalIndex: '1' }, final: { alternatives: [{ text: 'средней жесткости' }] } } },
]
ok(parseYandexSttResult(stream.map((x) => JSON.stringify(x)).join('\n')) === 'Купите резинку. средней жесткости', 'куски по порядку, нормализованный — где есть')
ok(splitJsonStream('{"a":"}{"}{"b":1}').length === 2, 'скобки внутри строк не режут объект')

console.log('Лимит расшифровок')
const lim = createChatVoiceTextLimiter({ limit: 2, windowMs: 1000 })
ok(lim.take('u:1', 0) && lim.take('u:1', 10) && !lim.take('u:1', 20), 'сверх лимита — нельзя')
ok(lim.take('u:2', 20) && lim.take('u:1', 1500), 'у другого свой лимит; окно прошло — снова можно')

console.log('Обработчики')
process.env.CHAT_VOICE_STORAGE = ''
process.env.CHAT_VOICE_BUCKET = ''
process.env.YANDEX_FOLDER_ID = ''
process.env.YANDEX_LLM_API_KEY = ''
process.env.YANDEX_LLM_AUTH = ''
const { chatVoiceBlocked, storeChatVoice, voiceAudioAnswer, voiceTextAnswer } = await import('../api/_lib/chat/chatVoiceHandler.js')
const voice = checkVoiceUpload(upload())
ok(chatVoiceBlocked({ voice })?.status === 503 && chatVoiceBlocked({ voice }).error === CHAT_VOICE_UNAVAILABLE_RU, 'бакет не настроен — «пока недоступны»')
ok(chatVoiceBlocked({ voice: null }) === null, 'текст без бакета — как раньше')
ok(chatVoiceBlocked({ voice }, { CHAT_VOICE_BUCKET: 'fd-chat-voice' }) === null, 'бакет есть — можно')
const puts = new Map()
const put = async (k, bytes) => puts.set(k, bytes)
let transcoded = null
const transcode = async (bufs, trim) => {
  transcoded = { n: bufs.length, trim }
  return Buffer.from(mp3Bytes(500))
}
const noFfmpeg = async () => {
  throw Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })
}
const stored = await storeChatVoice(voice, { side: 'staff', authorId: UUID_A, msgId: UUID_B }, put, transcode)
ok(stored.ok && stored.voice.key === `voice/u-${UUID_A}/${UUID_B}.mp3` && puts.size === 1, 'загрузка: файл по ключу автора и отправки')
ok(transcoded === null && puts.get(stored.voice.key).length === 4000, 'MP3 старой версии без обрезки — как есть, без ffmpeg')
const fromParts = await storeChatVoice(checkVoiceUpload(partsUpload({ trim: [1, 6] })), { side: 'client', authorId: UUID_A, msgId: UUID_B }, put, transcode)
ok(fromParts.ok && transcoded?.n === 2 && transcoded.trim.join() === '1,6' && puts.get(fromParts.voice.key).length === 500, 'куски → ffmpeg (склейка и обрезка) → в хранилище MP3')
const notAudio = await storeChatVoice(checkVoiceUpload(partsUpload({ parts: [b64(new Uint8Array(4000))] })), { side: 'staff', authorId: UUID_A, msgId: UUID_B }, put, transcode)
ok(!notAudio.ok && notAudio.status === 400, 'не звук — отказ, в хранилище не кладём')
const missing = await storeChatVoice(checkVoiceUpload(partsUpload()), { side: 'staff', authorId: UUID_A, msgId: UUID_B }, put, noFfmpeg)
ok(!missing.ok && missing.status === 503 && missing.error === CHAT_VOICE_UNAVAILABLE_RU, 'на сервере нет ffmpeg — 503 «пока недоступны»')
const garbled = await storeChatVoice(checkVoiceUpload(partsUpload()), { side: 'staff', authorId: UUID_A, msgId: UUID_B }, put, async () => Buffer.alloc(10))
ok(!garbled.ok && garbled.status === 400, 'ffmpeg вернул не MP3 — отказ')
const putFail = await storeChatVoice(voice, { side: 'client', authorId: UUID_A, msgId: null }, async () => {
  throw new Error('voice_put_http_403')
})
ok(!putFail.ok && putFail.status === 502, 'хранилище не приняло — 502, сообщение не создаём')

const fresh = { id: UUID_B, voice_key: key, voice_sec: 7, voice_text: null, voice_stt_op: null, created_at: new Date().toISOString() }
const getOk = async () => Buffer.from(mp3Bytes(10))
const audio = await voiceAudioAnswer(fresh, getOk)
ok(audio.status === 200 && audio.body.mime === 'audio/mpeg' && audio.body.audio.length > 0, 'звук свежего голосового')
const webmOut = await voiceAudioAnswer(fresh, async () => Buffer.from(webmBytes()))
ok(webmOut.body.mime === 'audio/webm', 'тип звука — по байтам файла')
const old = await voiceAudioAnswer({ ...fresh, created_at: '2020-01-01T00:00:00Z' }, getOk)
ok(old.status === 410 && old.body.error === CHAT_VOICE_EXPIRED_RU, 'старше суток — 410 «удалено», даже если файл ещё лежит')
ok((await voiceAudioAnswer(fresh, async () => null)).status === 410, 'файла уже нет — 410')
ok((await voiceAudioAnswer(null, getOk)).status === 404, 'не голосовое / не из этого диалога — 404')

let saved = []
const save = async (patch, opts) => saved.push({ patch, opts })
const off = await voiceTextAnswer(fresh, 'u:a', { save, get: getOk })
ok(off.status === 503 && off.body.error === CHAT_VOICE_TEXT_UNAVAILABLE_RU, 'SpeechKit не настроен — «расшифровка пока недоступна»')
process.env.YANDEX_FOLDER_ID = 'folder'
process.env.YANDEX_LLM_AUTH = 'metadata'
let started = 0
const start = async () => {
  started += 1
  return { ok: true, id: 'op-1' }
}
const ready = await voiceTextAnswer({ ...fresh, voice_text: 'Готово.' }, 'u:a', { save, start })
ok(ready.body.done && ready.body.text === 'Готово.' && started === 0, 'уже расшифровано — текст сразу, без оплаты')
const first = await voiceTextAnswer(fresh, 'u:a', { save, start, get: getOk })
ok(first.status === 200 && first.body.done === false && started === 1, 'первое нажатие — запустили распознавание')
ok(saved.at(-1)?.patch.voice_stt_op === 'op-1' && saved.at(-1)?.opts?.claim, 'номер распознавания записан, только если его ещё нет')
const waiting = await voiceTextAnswer({ ...fresh, voice_stt_op: 'op-1' }, 'u:a', { save, poll: async () => ({ ok: true, done: false }) })
ok(waiting.body.done === false && started === 1, 'ещё распознаётся — ждём, второй раз не платим')
saved = []
const done = await voiceTextAnswer({ ...fresh, voice_stt_op: 'op-1' }, 'u:a', { save, poll: async () => ({ ok: true, done: true, text: 'Купите резинку.' }) })
ok(done.body.done && done.body.text === 'Купите резинку.' && saved[0]?.patch.voice_text === 'Купите резинку.', 'готово — текст сохранён для обеих сторон')
saved = []
const broke = await voiceTextAnswer({ ...fresh, voice_stt_op: 'op-1' }, 'u:a', { save, poll: async () => ({ ok: false, error: 'stt_failed' }) })
ok(broke.status === 502 && saved[0]?.patch.voice_stt_op === null, 'сбой распознавания — номер сброшен, можно нажать ещё раз')
const expiredText = await voiceTextAnswer({ ...fresh, created_at: '2020-01-01T00:00:00Z' }, 'u:a', { save, start, get: getOk })
ok(expiredText.status === 410, 'звук уже удалён и не расшифровывали — 410')
const denied = await voiceTextAnswer(fresh, 'u:d', { save, get: getOk, start: async () => ({ ok: false, error: 'stt_start_http_403' }) })
ok(denied.status === 503, 'у сервера нет роли SpeechKit — «пока недоступна»')
let last
for (let i = 0; i < 25; i += 1) last = await voiceTextAnswer(fresh, 'u:spam', { save, start, get: getOk })
ok(last.status === 429 && last.body.error === CHAT_VOICE_TEXT_BUSY_RU, 'жмут без конца — «подождите минуту»')

if (failed) {
  console.error(`\nverify-chat-voice: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-voice: ok')
