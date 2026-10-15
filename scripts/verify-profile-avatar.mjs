/**
 * Фото профиля: ключ под avatar/ (вне правила удаления voice/), ссылка только на своё фото (чужой ключ в строке — нет),
 * лимиты загрузки, обрезка в круг (окно внутри фото, палец двигает фото), фото в контактах переписки,
 * обработчик: get / set / delete только своей строки, старый файл удаляется, HTML под видом фото — 400,
 * хранилище не настроено — 503; отдача картинки — навсегда в кэш телефона, не в общие кэши.
 * node scripts/verify-profile-avatar.mjs
 */
import {
  AVATAR_BAD_RU,
  AVATAR_BIG_RU,
  AVATAR_MAX_BYTES,
  AVATAR_UNAVAILABLE_RU,
  avatarMimeOf,
  avatarPhotoUrl,
  avatarStorageKey,
  checkAvatarUpload,
  isAvatarKey,
} from '../src/lib/profile/avatarCore.js'
import { AVATAR_ZOOM_MAX, clampCrop, cropSide, panCrop } from '../src/lib/profile/avatarCropCore.js'
import { buildClientContacts, buildThreadContacts } from '../src/lib/chat/chatContactsCore.js'
import { buildStaffContacts } from '../src/lib/chat/staffDmContactsCore.js'
import { avatarOp, sendAvatarFile } from '../api/_lib/profile/avatarHandler.js'
import { getVoice } from '../api/_lib/chat/chatVoiceStorage.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const F = '33333333-3333-4333-8333-333333333333'
const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const withHead = (head, n = 2000) => {
  const b = new Uint8Array(n)
  b.set(head)
  return b
}
const JPEG = withHead([0xff, 0xd8, 0xff, 0xe0])
const HTML = new TextEncoder().encode('<html><script>alert(1)</script>'.padEnd(400, ' '))

console.log('Ключ и ссылка')
const key = avatarStorageKey('client', A, F, 'image/jpeg')
ok(key === `avatar/c-${A}/${F}.jpg` && isAvatarKey(key), 'ключ клиента — avatar/c-<id>/<случайный>.jpg')
ok(avatarStorageKey('staff', B, F, 'image/webp') === `avatar/u-${B}/${F}.webp`, 'ключ сотрудника — avatar/u-…')
ok(!isAvatarKey(`voice/att/c-${A}/${F}.jpg`) && !isAvatarKey(`avatar/c-${A}/../x.jpg`) && !isAvatarKey(`avatar/c-${A}/${F}.svg`), 'чужие префиксы, «..» и SVG — не фото профиля')
ok(avatarMimeOf(key) === 'image/jpeg' && avatarMimeOf('x') === null, 'тип картинки — по ключу')
ok(avatarPhotoUrl(key, 'client', A) === `/api/me-profile?avatar=${encodeURIComponent(key)}`, 'своё фото — ссылка на /api/me-profile')
ok(avatarPhotoUrl(key, 'client', B) === null, 'ключ другого клиента в строке (правка в обход API) — не показываем')
ok(avatarPhotoUrl(key, 'staff', A) === null, 'ключ клиента у сотрудника с тем же id — не показываем')
ok(avatarPhotoUrl(null, 'client', A) === null && avatarPhotoUrl('', 'staff', A) === null, 'фото нет — null')

console.log('Загрузка')
ok(checkAvatarUpload({ data: b64(JPEG) }).ok, 'JPEG 2 КБ — да')
ok(checkAvatarUpload({ data: 'не base64!' }).error === AVATAR_BAD_RU, 'не base64 — «Фото не подходит»')
ok(checkAvatarUpload({ data: b64(withHead([0xff, 0xd8, 0xff], 50)) }).ok === false, 'меньше 100 байт — отказ')
const big = checkAvatarUpload({ data: b64(withHead([0xff, 0xd8, 0xff], AVATAR_MAX_BYTES + 3)) })
ok(big.status === 413 && big.error === AVATAR_BIG_RU, 'больше 200 КБ — 413 (телефон ужимает до 384 px)')

console.log('Обрезка в круг')
ok(cropSide(1000, 600, 1) === 600 && cropSide(1000, 600, 2) === 300, 'окно — короткая сторона, делённая на увеличение')
ok(cropSide(1000, 600, 99) === 600 / AVATAR_ZOOM_MAX && cropSide(1000, 600, 0) === 600, 'увеличение 1…4')
const c0 = clampCrop({ w: 1000, h: 600, zoom: 1, cx: 500, cy: 300 })
ok(c0.sx === 200 && c0.sy === 0 && c0.side === 600, 'по центру: квадрат 600 со сдвигом 200')
const edge = clampCrop({ w: 1000, h: 600, zoom: 1, cx: -50, cy: 9999 })
ok(edge.sx === 0 && edge.sy === 0 && edge.cx === 300, 'центр за краем — окно прижато к краю фото')
const moved = panCrop({ w: 1000, h: 600, zoom: 2, cx: 500, cy: 300 }, 30, 0, 300)
ok(moved.cx === 470 && moved.side === 300, 'палец вправо на 30 px при окне 300 — окно на 30 px фото влево (фото едет за пальцем)')

console.log('Фото в контактах переписки')
const clients = buildClientContacts({ clients: [{ id: A, name: 'Анна', avatar_key: key }, { id: B, name: 'Борис', avatar_key: key }], liveClientIds: [], threads: [] })
ok(clients[0].photo?.includes(encodeURIComponent(key)) && clients[1].photo === null, 'клиенты тренера: своё фото — да, чужой ключ — нет')
const fromThreads = buildThreadContacts([{ client_id: A, kind: 'supervisor' }], new Map([[A, { name: 'Анна', avatar_key: key }]]))
ok(fromThreads[0].photo != null, 'папка из диалогов (жалобы) — фото клиента')
const staffKey = avatarStorageKey('staff', B, F, 'image/jpeg')
const staff = buildStaffContacts({ viewerId: A, peers: [{ id: B, name: 'Ольга', role: 'trainer', avatar_key: staffKey }], liveUserIds: [], threads: [] })
ok(staff.colleagues[0].photo != null, 'коллеги — фото сотрудника')

console.log('Обработчик')
function fakeDb(rows) {
  return {
    from(table) {
      return {
        select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: rows[table]?.[id] ?? null, error: null }) }) }),
        update: (patch) => ({
          eq: async (_c, id) => {
            rows[table][id] = { ...rows[table][id], ...patch }
            return { error: null }
          },
        }),
      }
    },
  }
}
const prevMode = process.env.CHAT_VOICE_STORAGE
delete process.env.CHAT_VOICE_STORAGE
const db0 = fakeDb({ clients: { [A]: { avatar_key: null } } })
const me = { table: 'clients', side: 'client', id: A }
const off = await avatarOp(db0, me, 'set', { data: b64(JPEG) })
ok(off.status === 503 && off.body.error === AVATAR_UNAVAILABLE_RU, 'хранилище не настроено — 503 «Фото профиля пока недоступно»')
ok((await avatarOp(db0, me, 'get')).body.ready === false, 'get без хранилища — ready=false (кнопки «Выбрать фото» нет)')

process.env.CHAT_VOICE_STORAGE = 'memory'
const rows = { clients: { [A]: { avatar_key: null } }, users: { [B]: { avatar_key: null } } }
const db = fakeDb(rows)
ok((await avatarOp(db, { table: 'clients', side: 'staff', id: A }, 'get')).status === 403, 'таблица не совпадает со стороной — 403')
const fake = await avatarOp(db, me, 'set', { data: b64(HTML) })
ok(fake.status === 400 && rows.clients[A].avatar_key === null, 'HTML под видом фото — 400, строку не трогаем')
const first = await avatarOp(db, me, 'set', { data: b64(JPEG) })
const firstKey = rows.clients[A].avatar_key
ok(first.status === 200 && isAvatarKey(firstKey) && first.body.photo === avatarPhotoUrl(firstKey, 'client', A), 'фото сохранено — ссылка на новый ключ')
ok((await getVoice(firstKey)) != null, 'файл лёг в хранилище')
await avatarOp(db, me, 'set', { data: b64(JPEG) })
const secondKey = rows.clients[A].avatar_key
ok(secondKey !== firstKey && (await getVoice(firstKey)) == null, 'смена фото — новый ключ (новая ссылка), старый файл удалён')
const del = await avatarOp(db, me, 'delete')
ok(del.body.photo === null && rows.clients[A].avatar_key === null && (await getVoice(secondKey)) == null, 'удалить — ключ и файл убраны')
ok((await avatarOp(db, me, 'rename')).status === 400, 'неизвестное действие — 400')

const staffSet = await avatarOp(db, { table: 'users', side: 'staff', id: B }, 'set', { data: b64(JPEG) })
const staffFile = rows.users[B].avatar_key
ok(staffSet.status === 200 && staffFile.startsWith(`avatar/u-${B}/`), 'сотрудник — своя строка users, ключ avatar/u-…')

const res = {
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v
  },
  end(body) {
    this.body = body
  },
}
await sendAvatarFile(res, staffFile)
ok(res.statusCode === 200 && res.headers['Content-Type'] === 'image/jpeg' && res.body?.length === JPEG.length, 'картинка отдаётся с типом')
ok(/private/.test(res.headers['Cache-Control']) && /immutable/.test(res.headers['Cache-Control']), 'кэш: навсегда на телефоне, не в общих кэшах')
const bad = { ...res, headers: {}, statusCode: 0 }
await sendAvatarFile(bad, `voice/att/c-${A}/${F}.jpg`)
ok(bad.statusCode === 404, 'не ключ фото профиля (вложение чата) — 404')

if (prevMode === undefined) delete process.env.CHAT_VOICE_STORAGE
else process.env.CHAT_VOICE_STORAGE = prevMode

if (failed) {
  console.error(`\nverify-profile-avatar: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-profile-avatar: ok')
