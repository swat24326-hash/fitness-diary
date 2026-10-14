/**
 * Голосовые как в Telegram, сверх записи: подряд следующее голосовое собеседника, пауза помнит место, скорость
 * запоминается, обрезка по кадрам MP3, «прослушано» (кто и когда ставит), «Отправить без звука» до push, одноразовое.
 * node scripts/verify-chat-voice-player.mjs
 */
import { CHAT_VOICE_BARS, buildVoiceView, isMp3Header, voiceHeardBy, voiceOnceRefusal } from '../src/lib/chat/chatVoiceCore.js'
import { resolveChatOutgoing } from '../src/lib/chat/chatStickerCore.js'
import { voiceColumns } from '../api/_lib/chat/chatStore.js'
import {
  isPastVoiceRange,
  nextVoiceInQueue,
  parseVoiceSpeed,
  prevVoiceInQueue,
  voiceResumeAt,
} from '../src/lib/chat/chatVoicePlaylistCore.js'
import {
  clampVoiceTrim,
  isVoiceTrimmed,
  mp3FrameOffsets,
  trimMp3,
  trimVoiceResult,
  trimVoiceWave,
  trimmedVoiceSec,
} from '../src/lib/chat/chatVoiceTrimCore.js'
import { buildStaffDmPushPayload } from '../src/lib/chat/staffDmAccessCore.js'
import { buildDispatchPushPayload } from '../src/lib/push/trainerPushCore.js'
import { buildChatPushPayload } from '../api/_lib/chat/chatPushJob.js'
import { noteVoicePlayed, onceVoiceAnswer, storeChatVoice } from '../api/_lib/chat/chatVoiceHandler.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

console.log('Подряд, как в Telegram')
const queue = [
  { key: 'a', mine: false },
  { key: 'b', mine: true },
  { key: 'c', mine: false, expired: true },
  { key: 'd', mine: false },
]
ok(nextVoiceInQueue(queue, 'a')?.key === 'd', 'доиграло — следующее голосовое собеседника, своё и удалённое пропускаем')
ok(nextVoiceInQueue(queue, 'd') === null, 'последнее — дальше тишина')
ok(nextVoiceInQueue(queue, 'x') === null && nextVoiceInQueue(null, 'a') === null, 'не из этого диалога — не продолжаем')
ok(prevVoiceInQueue(queue, 'd')?.key === 'b' && prevVoiceInQueue(queue, 'a') === null, '«назад» с экрана блокировки — предыдущее')

console.log('Место и скорость')
ok(voiceResumeAt(0.4) === 0.4, 'пауза посередине — продолжаем оттуда')
ok(voiceResumeAt(0.99) === 0 && voiceResumeAt(0.01) === 0 && voiceResumeAt('x') === 0, 'почти доиграло / только начало — с начала')
ok(parseVoiceSpeed('1.5') === 1.5 && parseVoiceSpeed('3') === 1 && parseVoiceSpeed(null) === 1, 'скорость из памяти: 1.5x — берём, мусор — 1x')
ok(isPastVoiceRange(9.96, 10, [0, 1]) && !isPastVoiceRange(5, 10, [0, 0.8]) && isPastVoiceRange(8, 10, [0, 0.8]), 'обрезанная запись: стоп у правой ручки')

console.log('Обрезка по кадрам MP3')
/** MPEG-2 Layer III 16 кГц 32 кбит/с моно — так писали до 15.10.2026, такие ещё лежат в черновиках: кадр 144 байта. */
const frame = (i) => {
  const f = new Uint8Array(144)
  f.set([0xff, 0xf3, 0x48, 0xc4])
  f[10] = i
  return f
}
const mp3 = new Uint8Array(144 * 10)
for (let i = 0; i < 10; i += 1) mp3.set(frame(i), i * 144)
ok(mp3FrameOffsets(mp3).length === 10, '10 кадров по 144 байта')
const mp3hq = new Uint8Array(192 * 4)
for (let i = 0; i < 4; i += 1) mp3hq.set([0xff, 0xf3, 0x84, 0xc4], i * 192)
ok(mp3FrameOffsets(mp3hq).length === 4, 'как пишет телефон сейчас: 24 кГц 64 кбит/с — кадры по 192 байта')
ok(trimMp3(mp3hq, 0.25, 0.75)?.length === 192 * 2, 'и режется целыми кадрами')
const id3 = new Uint8Array(20 + mp3.length)
id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10])
id3.set(mp3, 20)
ok(mp3FrameOffsets(id3).length === 10, 'тег ID3 в начале пропускаем')
const cut = trimMp3(mp3, 0.2, 0.7)
ok(cut.length === 144 * 5 && cut[10] === 2 && isMp3Header(cut), 'вырезали 2…7 кадр целыми кадрами — сервер примет как MP3')
ok(trimMp3(mp3, 0.95, 1).length === 144, 'хвост — минимум один кадр')
ok(trimMp3(new Uint8Array(500), 0, 1) === null, 'не MP3 — null, не отправляем мусор')
ok(clampVoiceTrim([0.5, 0.52], 10).join() === '0.5,0.6', 'между ручками не меньше секунды')
const edge = clampVoiceTrim([0.95, 0.96], 10)
ok(Math.abs(edge[0] - 0.86) < 1e-9 && edge[1] === 0.96, 'у правого края — левую ручку отодвигаем на секунду')
ok(!isVoiceTrimmed([0, 1]) && isVoiceTrimmed([0.1, 1]), 'не тянули — запись целиком')
ok(trimmedVoiceSec(60, [0.25, 0.75]) === 30 && trimmedVoiceSec(1, [0, 0.1]) === 1, 'длительность обрезанного, не меньше секунды')
const wave = Array.from({ length: CHAT_VOICE_BARS }, (_, i) => (i < 24 ? 10 : 90))
const tw = trimVoiceWave(wave, [0.5, 1])
ok(tw.length === CHAT_VOICE_BARS && tw.every((v) => v === 90), 'волна обрезанного — снова 48 столбиков из оставшегося куска')
const rec = { audio: Buffer.from(mp3).toString('base64'), sec: 10, wave }
const sent = trimVoiceResult(rec, [0.5, 1])
ok(Buffer.from(sent.audio, 'base64').length === 144 * 5 && sent.sec === 5 && sent.wave.length === CHAT_VOICE_BARS, 'к отправке: звук, длительность и волна — только оставленный кусок')
ok(trimVoiceResult(rec, [0, 1]) === rec, 'не тянули ручки — запись как была')

console.log('«Прослушано»')
const voiceMsg = { voice_sec: 7, author_side: 'staff', author_user_id: 'u1', voice_played_at: null }
ok(voiceHeardBy(voiceMsg, { side: 'client' }), 'клиент слушает голосовое тренера — прослушано')
ok(!voiceHeardBy(voiceMsg, { side: 'staff' }), 'сотрудник слушает голосовое своей стороны — нет')
ok(!voiceHeardBy({ ...voiceMsg, author_side: 'client' }, { side: 'staff', mark: false }), 'главный админ смотрит чужой диалог — не ставим')
ok(!voiceHeardBy({ ...voiceMsg, voice_played_at: '2026-10-13T10:00:00Z' }, { side: 'client' }), 'уже прослушано — время первое')
ok(voiceHeardBy(voiceMsg, { userId: 'u2' }) && !voiceHeardBy(voiceMsg, { userId: 'u1' }), 'личная переписка: слушает собеседник — да, автор — нет')
ok(!voiceHeardBy({ ...voiceMsg, voice_sec: null }, { side: 'client' }), 'не голосовое — нет')
ok(buildVoiceView({ voice_sec: 7, voice_key: 'k', created_at: new Date().toISOString(), voice_played_at: 'x' }).played === true, 'экран получает played')
let marked = 0
ok((await noteVoicePlayed(voiceMsg, { side: 'client' }, async () => (marked += 1))) && marked === 1, 'звук отдан собеседнику — отметка в базе')
ok(!(await noteVoicePlayed(voiceMsg, { side: 'staff' }, async () => (marked += 1))) && marked === 1, 'автору — без отметки')
const broken = await noteVoicePlayed(voiceMsg, { side: 'client' }, async () => {
  throw new Error('db_down')
})
ok(broken === false, 'база не ответила — слушать всё равно можно')

console.log('«Отправить без звука»')
const chatPush = buildChatPushPayload({ kind: 'trainer', authorSide: 'staff', clientId: 'c1', clientName: 'Иван', authorName: 'Анна', body: '🎤', silent: true })
ok(chatPush.silent === true && buildDispatchPushPayload(chatPush).silent === true, 'клиенту: push тихий до самого телефона')
ok(!('silent' in buildChatPushPayload({ kind: 'trainer', authorSide: 'staff', clientId: 'c1', body: 'x' })), 'обычная отправка — со звуком')
ok(buildStaffDmPushPayload({ authorId: 'u1', authorName: 'Анна', body: 'x', silent: true }).silent === true, 'коллеге — тоже тихо')
ok(!('silent' in buildDispatchPushPayload({ title: 'x', silent: 'yes' })), 'мусор вместо true — со звуком')

console.log('Одноразовое')
const mp3b64 = Buffer.from(mp3).toString('base64')
const up = resolveChatOutgoing({ audio: mp3b64, sec: 7, wave, once: true })
ok(up.ok && up.voice.once === true && up.body === '🎤 Одноразовое голосовое 0:07', 'отправка: флаг и подпись для списка и push')
ok(resolveChatOutgoing({ audio: mp3b64, sec: 7, wave, once: 'yes' }).voice.once === false, 'мусор вместо true — обычное голосовое')
const stored = await storeChatVoice(up.voice, { side: 'staff', authorId: '11111111-1111-1111-1111-111111111111', msgId: null }, async () => {})
ok(stored.ok && voiceColumns(stored.voice).voice_once === true, 'в базу — voice_once')
ok(!('voice_once' in voiceColumns({ key: 'k', sec: 1, wave })), 'обычное — колонку не трогаем')
const onceMsg = { ...voiceMsg, voice_once: true, voice_key: 'k', voice_text: 'секрет', created_at: new Date().toISOString() }
ok(voiceOnceRefusal(onceMsg, { side: 'client' }) === null, 'собеседник, ещё не слушал — отдаём')
ok(voiceOnceRefusal(onceMsg, { side: 'staff' })?.status === 403, 'автор своё одноразовое не слушает')
ok(voiceOnceRefusal({ ...onceMsg, author_side: 'client' }, { side: 'staff', mark: false })?.status === 403, 'главный админ, просто смотрит диалог, — не слушает (иначе слушал бы сколько угодно)')
ok(voiceOnceRefusal({ ...onceMsg, voice_played_at: 'x' }, { side: 'client' })?.status === 410, 'второй раз — 410 «прослушано»')
ok(voiceOnceRefusal(onceMsg, { side: 'client' }, 'text')?.status === 403, '«→ Аа» у одноразового — нет')
ok(voiceOnceRefusal({ ...voiceMsg }, { side: 'staff' }) === null, 'обычное голосовое — правила прежние')
ok(voiceOnceRefusal(onceMsg, { userId: 'u2' }) === null && voiceOnceRefusal(onceMsg, { userId: 'u1' })?.status === 403, 'личка: собеседник — да, автор — нет')
const audioOut = { status: 200, body: { audio: 'x' } }
ok((await onceVoiceAnswer(audioOut, async () => true)) === audioOut, 'забрал первым — звук')
ok((await onceVoiceAnswer(audioOut, async () => false)).status === 410, 'два запроса разом — второму 410, звук не уходит')
const fresh = buildVoiceView(onceMsg)
ok(fresh.once && !fresh.expired && fresh.text === null, 'экран: одноразовое, слушать можно, текста нет')
ok(buildVoiceView({ ...onceMsg, voice_played_at: 'x' }).expired === true, 'прослушали — «удалено» у обоих')
ok(buildVoiceView({ ...voiceMsg, voice_key: 'k', created_at: new Date().toISOString() }).once === false, 'обычное — once: false')
const withOnce = [{ key: 'a' }, { key: 'b', once: true }, { key: 'c' }]
ok(nextVoiceInQueue(withOnce, 'a')?.key === 'c' && prevVoiceInQueue(withOnce, 'c')?.key === 'a', 'подряд одноразовое не включается само — только нажатием')

if (failed) {
  console.error(`\nverify-chat-voice-player: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-voice-player: ok')
