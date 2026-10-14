/**
 * Видеокружки: тип по первым байтам (MP4 / WebM), 1–60 с, до 15 МБ, только настоящие байты (не из JSON),
 * подпись «📹 Видеосообщение 0:12», формат записи, ключ хранилища, вид для экрана, бинарный запрос → тело отправки,
 * отдача файла байтами и «удалено через сутки», повтор отправки без дубля.
 * node scripts/verify-chat-video.mjs
 */
import {
  CHAT_VIDEO_BAD_RU,
  CHAT_VIDEO_AUDIO_BPS,
  CHAT_VIDEO_BIG_RU,
  CHAT_VIDEO_MAX_BYTES,
  CHAT_VIDEO_MAX_SEC,
  CHAT_VIDEO_SHORT_RU,
  CHAT_VIDEO_VIDEO_BPS,
  baseVideoMime,
  chatVideoLabel,
  checkVideoUpload,
  isVideoEnding,
  normalizeVideoSec,
  pickVideoRecorderMime,
  sniffVideoMime,
  videoMetaFromQuery,
} from '../src/lib/chat/chatVideoCore.js'
import { attachStorageKey, buildAttachView, checkAttachBytes, checkAttachUpload, isAttachStorageKey } from '../src/lib/chat/chatAttachCore.js'
import { resolveChatOutgoing } from '../src/lib/chat/chatStickerCore.js'
import { nextChatOutgoingId } from '../src/lib/chat/chatDeliveryCore.js'
import { attachColumns } from '../api/_lib/chat/chatAttachStore.js'
import { attachFileAnswer, sendChatFileAnswer, storeChatAttach } from '../api/_lib/chat/chatAttachHandler.js'
import { VIDEO_OPS_CLIENT, VIDEO_OPS_COACH, VIDEO_OPS_STAFF, isVideoUpload, videoSendBody } from '../api/_lib/chat/chatVideoHandler.js'

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
const withHead = (head, n = 5000) => {
  const b = Buffer.alloc(n)
  b.set(head)
  return b
}
const MP4 = withHead([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
const WEBM = withHead([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0xf7, 0x81])
const JPEG = withHead([0xff, 0xd8, 0xff, 0xe0])
const HTML = withHead([...Buffer.from('<html><script>')])

console.log('Тип по первым байтам')
ok(sniffVideoMime(MP4) === 'video/mp4' && sniffVideoMime(WEBM) === 'video/webm', 'MP4 (ftyp) и WebM (EBML) узнаются')
ok(sniffVideoMime(JPEG) === null && sniffVideoMime(HTML) === null, 'фото и HTML — не видео')
ok(checkAttachBytes('video', MP4) === 'video/mp4' && checkAttachBytes('video', JPEG) === null, 'фото под видом видео — нет')
ok(checkAttachBytes('photo', MP4) === null && checkAttachBytes('file', WEBM) === null, 'видео под видом фото или PDF — нет')
ok(baseVideoMime('video/mp4;codecs=avc1,mp4a') === 'video/mp4' && baseVideoMime('audio/mp4') === null, 'кодек отрезается, не видео — null')

console.log('Длительность и размер')
ok(normalizeVideoSec('12') === 12 && normalizeVideoSec(60) === 60 && normalizeVideoSec(0.6) === 1, '1–60 с; 0,6 с округляется до 1')
ok(normalizeVideoSec(61) === null && normalizeVideoSec(0) === null && normalizeVideoSec('x') === null, 'больше минуты, ноль и мусор — нет')
const good = checkVideoUpload({ bytes: MP4, sec: 12 })
ok(good.ok && good.mime === 'video/mp4' && good.sec === 12 && good.bytes === MP4.length, 'MP4 12 с — можно')
ok(checkVideoUpload({ bytes: MP4, sec: 0 }).error === CHAT_VIDEO_SHORT_RU, 'без длительности — «слишком коротко»')
ok(checkVideoUpload({ bytes: HTML, sec: 5 }).error === CHAT_VIDEO_BAD_RU, 'не видео — «не записалось»')
ok(checkVideoUpload({ bytes: Buffer.alloc(10), sec: 5 }).ok === false, 'пустышка — отказ')
const big = checkVideoUpload({ bytes: withHead([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70], CHAT_VIDEO_MAX_BYTES + 1), sec: 30 })
ok(big.status === 413 && big.error === CHAT_VIDEO_BIG_RU, 'больше 15 МБ — 413')
ok(CHAT_VIDEO_MAX_BYTES >= ((CHAT_VIDEO_VIDEO_BPS + CHAT_VIDEO_AUDIO_BPS) * CHAT_VIDEO_MAX_SEC * 1.25) / 8, 'минута при заданном битрейте влезает в лимит с запасом 25%')
ok(checkVideoUpload({ bytes: { length: 5000, 4: 0x66, 5: 0x74, 6: 0x79, 7: 0x70 }, sec: 5 }).ok === false, 'из JSON видео не принимаем — только настоящие байты')
ok(checkAttachUpload({ kind: 'video', data: MP4.toString('base64'), sec: 5 }).ok === false, 'base64-видео в JSON — отказ (только бинарный запрос)')
ok(isVideoEnding(50) && !isVideoEnding(49), 'последние 10 секунд — таймер предупреждает')

console.log('Текст сообщения')
ok(chatVideoLabel(12) === '📹 Видеосообщение 0:12' && chatVideoLabel(60) === '📹 Видеосообщение 1:00', 'подпись с длительностью')
const out = resolveChatOutgoing({ attach: { kind: 'video', buffer: MP4, sec: 12 } })
ok(out.ok && out.body === '📹 Видеосообщение 0:12' && out.attach.kind === 'video' && out.attach.sec === 12 && out.voice === null, 'отправка: body для списка и push')

console.log('Формат записи')
ok(pickVideoRecorderMime((m) => m.startsWith('video/')) === 'video/mp4;codecs=avc1,mp4a', 'умеет MP4 — пишем MP4 (играет и на iPhone)')
ok(pickVideoRecorderMime((m) => m.startsWith('video/webm')) === 'video/webm;codecs=vp9,opus', 'только WebM — WebM')
ok(pickVideoRecorderMime(() => false) === null, 'ничего не умеет — null (покажем «браузер не умеет»)')
ok(pickVideoRecorderMime(() => { throw new Error('x') }) === null, 'isTypeSupported упал — null, не падаем')

console.log('Хранилище и вид для экрана')
const key = attachStorageKey('staff', UUID_A, UUID_B, 'video/mp4')
ok(key === `voice/att/u-${UUID_A}/${UUID_B}.mp4` && isAttachStorageKey(key), 'ключ под voice/ — бакет удалит через сутки')
ok(isAttachStorageKey(attachStorageKey('client', UUID_A, UUID_B, 'video/webm')), 'WebM клиента — свой ключ')
const now = Date.parse('2026-10-14T12:00:00Z')
const row = { id: 'm1', body: '📹 Видеосообщение 0:12', created_at: new Date(now - 1000).toISOString(), ...attachColumns({ kind: 'video', key, mime: 'video/mp4', bytes: 5000, name: null, w: null, h: null, caption: '', sec: 12 }) }
ok(row.attach_sec === 12, 'длительность — в attach_sec')
ok(!('attach_sec' in attachColumns({ kind: 'photo', key, mime: 'image/jpeg', bytes: 1, caption: '' })), 'у фото attach_sec не пишем')
const view = buildAttachView(row, now)
ok(view.kind === 'video' && view.sec === 12 && !view.expired && !('key' in view), 'видео: длительность, ключ наружу не отдаём')
ok(buildAttachView({ ...row, created_at: '2026-10-12T00:00:00Z' }, now).expired, 'старше суток — «удалено»')

console.log('Бинарный запрос')
ok(isVideoUpload({ body: MP4 }) && !isVideoUpload({ body: { action: 'chat-send' } }) && !isVideoUpload({ body: '{}' }), 'байты — видео, JSON и строка — нет')
const q = { op: 'dm-send', user_id: UUID_A, sec: '12', client_msg_id: UUID_B, reply_to: UUID_A, silent: '1' }
const body = videoSendBody({ body: MP4, query: q }, VIDEO_OPS_COACH)
ok(body.op === 'dm-send' && body.user_id === UUID_A && body.attach.buffer === MP4 && body.attach.sec === '12', 'адрес → тело отправки с байтами')
ok(body.client_msg_id === UUID_B && body.reply_to === UUID_A && body.silent === true, 'номер, ответ и «без звука» — из адреса')
ok(videoSendBody({ body: MP4, query: { ...q, op: 'dm-send' } }, VIDEO_OPS_CLIENT).op === undefined, 'клиент не шлёт видео коллегам — пустое тело (400)')
ok(videoSendBody({ body: MP4, query: { ...q, op: 'push-records' } }, VIDEO_OPS_STAFF).attach === undefined, 'чужое действие — пустое тело')
ok(VIDEO_OPS_STAFF.includes('send') && VIDEO_OPS_STAFF.includes('group-send') && VIDEO_OPS_COACH.includes('chat-send'), 'сотрудник, телефон тренера и чат клуба — могут')
const meta = videoMetaFromQuery({ sec: ['7', '9'] })
ok(meta.sec === '7' && meta.silent === false && meta.reply_to === undefined, 'повтор параметра — первый, без silent — со звуком')

console.log('Хранилище и отдача')
const saved = new Map()
const put = async (k, bytes, mime) => saved.set(k, { bytes, mime })
const goodVideo = { ...checkAttachUpload({ kind: 'video', buffer: WEBM, sec: 9 }), caption: '' }
const stored = await storeChatAttach(goodVideo, { side: 'client', authorId: UUID_A, msgId: UUID_B }, put)
ok(stored.ok && stored.attach.mime === 'video/webm' && stored.attach.sec === 9 && stored.attach.key.endsWith('.webm'), 'WebM лёг в хранилище с длительностью')
const msg = { ...row, attach_key: stored.attach.key, attach_mime: 'video/webm' }
const get = async (k) => saved.get(k)?.bytes ?? null
const fresh = await attachFileAnswer(msg, get)
ok(fresh.status === 200 && Buffer.isBuffer(fresh.file) && fresh.file.equals(WEBM) && fresh.body.mime === 'video/webm' && !fresh.body.data, 'видео отдаётся байтами, без base64')
const old = await attachFileAnswer({ ...msg, created_at: '2026-01-01T00:00:00Z' }, get)
ok(old.status === 410 && old.body.error === 'Видео удалено через сутки', 'через сутки — 410 «Видео удалено через сутки»')

const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.sent = b } }
sendChatFileAnswer(res, fresh)
ok(res.statusCode === 200 && res.headers['Content-Type'] === 'video/webm' && res.sent === fresh.file, 'ответ: байты с типом видео')
ok(res.headers['Cache-Control'] === 'private, no-store', 'видео не кэшируется прокси')
const json = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { this.sent = b } }
sendChatFileAnswer(json, old)
ok(json.statusCode === 410 && /json/.test(json.headers['Content-Type']) && JSON.parse(json.sent).error, 'ошибка — JSON, как раньше')

console.log('Повтор отправки')
const blob = { size: 5000 }
const first = nextChatOutgoingId(null, 'k', { video: blob, sec: 12 })
ok(nextChatOutgoingId(first, 'k', { video: blob, sec: 12 }) === first, 'тот же кружок после ошибки — тот же номер (без дубля)')
ok(nextChatOutgoingId(first, 'k', { video: { size: 5000 }, sec: 12 }).id !== first.id, 'новый кружок той же длины — новый номер')
ok(nextChatOutgoingId(first, 'k', { body: 'текст' }).id !== first.id, 'текст после кружка — новый номер')

if (failed) {
  console.error(`\nverify-chat-video: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-video: ok')
