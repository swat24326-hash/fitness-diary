/**
 * Фото и PDF в переписке: тип по первым байтам (HTML/SVG — нет), лимиты размера, имя файла, подпись,
 * текст сообщения «📷 / 📎», ключ хранилища под правилом бакета, сутки хранения, вид для экрана,
 * обработчики: загрузка (не тот тип — 400), отдача (сутки → 410), хранилище не настроено — 503.
 * Стикер с клавиатуры: PNG / WebP до 512 px, ключ chat-sticker/ (не удаляется), не стареет.
 * node scripts/verify-chat-attach.mjs
 */
import {
  CHAT_ATTACH_BAD_RU,
  CHAT_ATTACH_BIG_RU,
  CHAT_ATTACH_CAPTION_LONG_RU,
  CHAT_ATTACH_UNAVAILABLE_RU,
  CHAT_CAPTION_MAX,
  CHAT_FILE_MAX_BYTES,
  CHAT_PHOTO_MAX_BYTES,
  CHAT_STICKER_IMG_MAX_BYTES,
  attachStorageKey,
  buildAttachView,
  chatAttachLabel,
  checkAttachBytes,
  checkAttachUpload,
  cleanAttachName,
  formatAttachSize,
  isAttachExpired,
  isAttachStorageKey,
  scaleToMaxSide,
  sniffAttachMime,
} from '../src/lib/chat/chatAttachCore.js'
import { CHAT_VOICE_TTL_MS } from '../src/lib/chat/chatVoiceCore.js'
import { resolveChatOutgoing } from '../src/lib/chat/chatStickerCore.js'
import { buildChatMessageView } from '../src/lib/chat/chatMessageCore.js'
import { nextChatOutgoingId } from '../src/lib/chat/chatDeliveryCore.js'
import { buildChatFeed } from '../src/lib/chat/chatFeedCore.js'
import { attachColumns } from '../api/_lib/chat/chatAttachStore.js'
import { attachFileAnswer, storeChatAttach, storeChatOutgoing } from '../api/_lib/chat/chatAttachHandler.js'
import { chatVoiceBlocked } from '../api/_lib/chat/chatVoiceHandler.js'

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
const withHead = (head, n = 2000) => {
  const b = new Uint8Array(n)
  b.set(head)
  return b
}
const JPEG = withHead([0xff, 0xd8, 0xff, 0xe0])
const PNG = withHead([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP = withHead([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
const PDF = withHead([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const HTML = withHead([...Buffer.from('<html><script>')])
const SVG = withHead([...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')])
const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const photo = (over = {}) => ({ kind: 'photo', data: b64(JPEG), w: 1200, h: 1600, ...over })
const pdf = (over = {}) => ({ kind: 'file', data: b64(PDF), name: 'Справка.pdf', ...over })

console.log('Тип по первым байтам')
ok(sniffAttachMime(JPEG) === 'image/jpeg' && sniffAttachMime(PNG) === 'image/png', 'JPEG и PNG узнаются')
ok(sniffAttachMime(WEBP) === 'image/webp' && sniffAttachMime(PDF) === 'application/pdf', 'WebP и PDF узнаются')
ok(sniffAttachMime(HTML) === null && sniffAttachMime(SVG) === null, 'HTML и SVG — не принимаем (через них можно подсунуть скрипт)')
ok(checkAttachBytes('photo', PDF) === null && checkAttachBytes('file', JPEG) === null, 'PDF под видом фото и фото под видом PDF — нет')
ok(checkAttachBytes('photo', WEBP) === 'image/webp' && checkAttachBytes('file', PDF) === 'application/pdf', 'вид и тип совпали — тип файла')

console.log('Проверка загрузки')
const p = checkAttachUpload(photo())
ok(p.ok && p.kind === 'photo' && p.w === 1200 && p.h === 1600 && p.name === null, 'фото: размеры есть, имени нет')
ok(checkAttachUpload(photo({ w: 0 })).ok === false, 'фото без размеров — отказ')
ok(checkAttachUpload({ kind: 'audio', data: b64(JPEG) }).error === CHAT_ATTACH_BAD_RU, 'чужой вид — «можно фото или PDF»')
ok(checkAttachUpload(photo({ data: 'не base64!' })).ok === false, 'мусор вместо base64 — отказ')
ok(checkAttachUpload(photo({ data: b64(new Uint8Array(10)) })).ok === false, 'пустышка меньше 100 байт — отказ')
const bigPhoto = checkAttachUpload(photo({ data: b64(withHead([0xff, 0xd8, 0xff], CHAT_PHOTO_MAX_BYTES + 3)) }))
ok(bigPhoto.status === 413 && bigPhoto.error === CHAT_ATTACH_BIG_RU, 'фото больше 1,5 МБ — 413 (телефон ужимает до лимита)')
const bigPdf = checkAttachUpload(pdf({ data: b64(withHead([0x25, 0x50], CHAT_FILE_MAX_BYTES + 3)) }))
ok(bigPdf.status === 413, 'PDF больше 3,5 МБ — 413')
ok(checkAttachUpload(pdf({ data: b64(withHead([0x25, 0x50], CHAT_FILE_MAX_BYTES)) })).ok, 'PDF ровно 3,5 МБ — можно')
ok(CHAT_FILE_MAX_BYTES * (4 / 3) < 5 * 1024 * 1024 - 64 * 1024, '3,5 МБ в base64 влезает в тело запроса 5 МБ с запасом')

console.log('Имя PDF')
ok(cleanAttachName('C:\\Users\\Анна\\Справка от врача.PDF') === 'Справка от врача.pdf', 'без пути, расширение — .pdf')
ok(cleanAttachName('../../etc/passwd') === 'passwd.pdf', 'путь вверх отрезается')
ok(cleanAttachName('a<b>:"c|?*.pdf') === 'abc.pdf', 'служебные символы убраны')
ok(cleanAttachName('') === 'Документ.pdf' && cleanAttachName('.pdf') === 'Документ.pdf', 'без имени — «Документ.pdf»')
ok(cleanAttachName('я'.repeat(200)).length === 80, 'длинное имя — до 80 знаков')

console.log('Текст сообщения и подпись')
ok(chatAttachLabel('photo', null, '') === '📷 Фото', 'фото без подписи — «📷 Фото»')
ok(chatAttachLabel('photo', null, 'Так присед?') === '📷 Так присед?', 'фото с подписью — подпись')
ok(chatAttachLabel('file', 'Справка.pdf', '') === '📎 Справка.pdf', 'PDF — имя файла')
ok(chatAttachLabel('file', 'Справка.pdf', 'на заморозку') === '📎 Справка.pdf · на заморозку', 'PDF с подписью')
const out = resolveChatOutgoing({ body: '  Так присед?  ', attach: photo() })
ok(out.ok && out.body === '📷 Так присед?' && out.attach.caption === 'Так присед?' && out.voice === null, 'отправка: текст поля — подпись, body — для списка и push')
ok(resolveChatOutgoing({ attach: pdf() }).body === '📎 Справка.pdf', 'без подписи — можно')
const longCap = resolveChatOutgoing({ body: 'а'.repeat(CHAT_CAPTION_MAX + 1), attach: photo() })
ok(longCap.ok === false && longCap.error === CHAT_ATTACH_CAPTION_LONG_RU, 'подпись больше 1000 — отказ с понятным текстом')
ok(chatAttachLabel('file', 'я'.repeat(76) + '.pdf', 'б'.repeat(CHAT_CAPTION_MAX)).length <= 2000, 'самое длинное имя + подпись влезают в body (2000)')
ok(resolveChatOutgoing({ body: 'текст' }).attach === null, 'обычный текст — без вложения')

console.log('Повтор отправки')
const first = nextChatOutgoingId(null, 'k', { body: '', attach: photo() })
ok(nextChatOutgoingId(first, 'k', { body: '', attach: photo() }) === first, 'то же фото после ошибки — тот же номер (без дубля)')
ok(nextChatOutgoingId(first, 'k', { body: '', attach: photo({ data: b64(PNG) }) }).id !== first.id, 'другое фото без подписи — новый номер, не старое фото')
ok(nextChatOutgoingId(first, 'k', { body: '' }).id !== first.id, 'пустой текст после фото — новый номер')

console.log('Хранилище и срок')
const key = attachStorageKey('client', UUID_A, UUID_B, 'image/jpeg')
ok(key === `voice/att/c-${UUID_A}/${UUID_B}.jpg` && isAttachStorageKey(key), 'ключ под voice/ — правило бакета удалит через сутки')
ok(isAttachStorageKey(attachStorageKey('staff', UUID_A, UUID_B, 'application/pdf')), 'PDF сотрудника — свой ключ')
ok(!isAttachStorageKey(`voice/c-${UUID_A}/${UUID_B}.mp3`) && !isAttachStorageKey('voice/att/../x.jpg'), 'чужой ключ — нет')
const now = Date.parse('2026-10-14T12:00:00Z')
ok(!isAttachExpired('2026-10-14T00:00:00Z', now) && isAttachExpired(new Date(now - CHAT_VOICE_TTL_MS).toISOString(), now), 'сутки — и всё')

console.log('Вид для экрана')
const row = { id: 'm1', body: '📷 Так присед?', created_at: new Date(now - 1000).toISOString(), author_side: 'client', ...attachColumns({ kind: 'photo', key, mime: 'image/jpeg', bytes: 2000, name: null, w: 1200, h: 1600, caption: 'Так присед?' }) }
const view = buildAttachView(row, now)
ok(view.kind === 'photo' && view.caption === 'Так присед?' && view.w === 1200 && !view.expired && !('key' in view), 'фото: подпись, размеры, ключ наружу не отдаём')
ok(buildAttachView({ ...row, created_at: '2026-10-12T00:00:00Z' }, now).expired, 'старше суток — «удалено»')
ok(buildAttachView({ ...row, attach_key: null }, now).expired, 'нет файла — «удалено»')
ok(buildAttachView({ id: 'm2', body: 'текст' }) === null, 'без вложения — null')
ok(buildChatMessageView(row, 'staff', new Map()).attach?.kind === 'photo', 'лента сотрудника видит вложение')
const emojiCap = buildChatMessageView({ ...row, body: '📷 🔥', attach_caption: '🔥' }, 'staff', new Map())
ok(buildChatFeed([emojiCap]).find((x) => x.type === 'msg')?.big === false, 'фото с подписью «🔥» — фото, не крупный смайлик')
ok(attachColumns(null) && Object.keys(attachColumns(null)).length === 0, 'без вложения колонки не трогаем')
ok(formatAttachSize(340_000) === '332 КБ' && formatAttachSize(1_250_000) === '1,2 МБ', 'размер: КБ и МБ по-русски')
const scaled = scaleToMaxSide(4032, 3024)
ok(scaled.w === 1600 && scaled.h === 1200 && scaleToMaxSide(800, 600).w === 800, 'фото больше 1600 — уменьшаем, меньше — как есть')

console.log('Обработчики')
const saved = new Map()
const put = async (k, bytes, mime) => saved.set(k, { bytes, mime })
const goodPhoto = { ...checkAttachUpload(photo()), caption: '' }
const stored = await storeChatAttach(goodPhoto, { side: 'client', authorId: UUID_A, msgId: UUID_B }, put)
ok(stored.ok && stored.attach.mime === 'image/jpeg' && saved.get(stored.attach.key)?.mime === 'image/jpeg', 'фото легло в хранилище с типом')
const again = await storeChatAttach(goodPhoto, { side: 'client', authorId: UUID_A, msgId: UUID_B }, put)
ok(again.attach.key === stored.attach.key, 'повтор той же отправки — тот же файл')
const fake = await storeChatAttach({ ...checkAttachUpload(photo({ data: b64(HTML) })), caption: '' }, { side: 'client', authorId: UUID_A, msgId: UUID_B }, put)
ok(fake.ok === false && fake.status === 400, 'HTML под видом фото — 400, в хранилище не кладём')
const broken = await storeChatAttach(goodPhoto, { side: 'staff', authorId: UUID_A, msgId: UUID_B }, async () => {
  throw new Error('voice_put_http_403')
})
ok(broken.ok === false && broken.status === 502, 'бакет не принял — 502')
const none = await storeChatOutgoing({ voice: null, attach: null }, { side: 'client', authorId: UUID_A, msgId: UUID_B })
ok(none.ok && none.voice === null && none.attach === null, 'текст — в хранилище ничего не кладём')
ok(chatVoiceBlocked({ attach: goodPhoto }, {})?.status === 503 && chatVoiceBlocked({ attach: goodPhoto }, {}).error === CHAT_ATTACH_UNAVAILABLE_RU, 'хранилище не настроено — 503 «Фото и файлы пока недоступны»')
ok(chatVoiceBlocked({ attach: goodPhoto }, { CHAT_VOICE_STORAGE: 'memory' }) === null, 'хранилище есть — можно')

const msg = { ...row, attach_key: stored.attach.key }
const get = async (k) => saved.get(k)?.bytes ?? null
const fresh = await attachFileAnswer(msg, get)
ok(fresh.status === 200 && fresh.body.mime === 'image/jpeg' && fresh.body.data === b64(JPEG), 'файл отдаётся base64 с типом')
const old = await attachFileAnswer({ ...msg, created_at: '2026-01-01T00:00:00Z' }, get)
ok(old.status === 410 && old.body.error === 'Фото удалено через сутки', 'через сутки — 410 «Фото удалено через сутки»')
const gone = await attachFileAnswer({ ...msg, attach_kind: 'file', attach_key: `voice/att/c-${UUID_A}/${UUID_A}.pdf` }, get)
ok(gone.status === 410 && gone.body.error === 'Файл удалён через сутки', 'бакет уже удалил — 410')
ok((await attachFileAnswer(null, get)).status === 404, 'не вложение / чужой диалог — 404')

console.log('Стикер с клавиатуры (картинка с прозрачностью)')
const sticker = (over = {}) => ({ kind: 'sticker', data: b64(WEBP), w: 512, h: 480, ...over })
const st = checkAttachUpload(sticker())
ok(st.ok && st.kind === 'sticker' && st.w === 512 && st.name === null, 'стикер: размеры есть, имени нет')
ok(checkAttachUpload(sticker({ w: 513 })).ok === false, 'стикер больше 512 px — отказ (телефон ужимает)')
ok(checkAttachUpload(sticker({ data: b64(withHead([0x52, 0x49, 0x46, 0x46], CHAT_STICKER_IMG_MAX_BYTES + 3)) })).status === 413, 'стикер больше 600 КБ — 413')
ok(checkAttachBytes('sticker', PNG) === 'image/png' && checkAttachBytes('sticker', WEBP) === 'image/webp', 'стикер: PNG и WebP — да')
ok(checkAttachBytes('sticker', JPEG) === null && checkAttachBytes('sticker', SVG) === null, 'стикер: JPEG (без прозрачности) и SVG — нет')
ok(chatAttachLabel('sticker', null, '') === '🖼 Стикер' && chatAttachLabel('sticker', null, 'ок') === '🖼 Стикер · ок', 'в списке и push — «🖼 Стикер»')
ok(resolveChatOutgoing({ attach: sticker() }).body === '🖼 Стикер', 'отправка стикера: body для списка')
const stKey = attachStorageKey('client', UUID_A, UUID_B, 'image/webp', 'sticker')
ok(stKey === `chat-sticker/c-${UUID_A}/${UUID_B}.webp` && isAttachStorageKey(stKey), 'ключ стикера — chat-sticker/, вне правила удаления voice/')
ok(!isAttachStorageKey(`chat-sticker/c-${UUID_A}/${UUID_B}.jpg`) && !isAttachStorageKey('chat-sticker/../x.png'), 'чужой ключ стикера — нет')
ok(!isAttachExpired('2020-01-01T00:00:00Z', now, 'sticker') && isAttachExpired('2020-01-01T00:00:00Z', now, 'photo'), 'стикер не стареет, фото — да')
const stSaved = await storeChatAttach({ ...st, caption: '' }, { side: 'client', authorId: UUID_A, msgId: UUID_B }, put)
ok(stSaved.ok && stSaved.attach.key.startsWith('chat-sticker/') && stSaved.attach.mime === 'image/webp', 'стикер лёг в хранилище под chat-sticker/')
const stRow = { id: 'm3', body: '🖼 Стикер', created_at: '2026-01-01T00:00:00Z', author_side: 'client', ...attachColumns(stSaved.attach) }
ok(buildAttachView(stRow, now).kind === 'sticker' && !buildAttachView(stRow, now).expired, 'старый стикер в ленте — не «удалено»')
const stOld = await attachFileAnswer(stRow, get)
ok(stOld.status === 200 && stOld.body.mime === 'image/webp', 'стикер полугодовой давности отдаётся')
ok((await attachFileAnswer({ ...stRow, attach_key: `voice/att/c-${UUID_A}/${UUID_B}.png` }, get)).status === 410, 'стикер, файла которого нет в хранилище, — 410')

if (failed) {
  console.error(`\nverify-chat-attach: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-chat-attach: ok')
