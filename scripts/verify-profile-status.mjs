/**
 * Смайлик-статус рядом с именем: сроки (час, до конца дня по Москве, 3 дня, неделя, без срока), только смайлики
 * из набора, истёкший не показываем, у клиента в день рождения — 🎂, статус в контактах переписки,
 * обработчик: поставить / убрать только свою строку, чужой смайлик — 400 без записи; Sync планшета статус не пишет.
 * node scripts/verify-profile-status.mjs
 */
import {
  PROFILE_BIRTHDAY_EMOJI,
  PROFILE_STATUS_BAD_RU,
  activeOwnStatus,
  checkProfileStatusInput,
  profileStatusEmoji,
  profileStatusUntil,
  profileStatusUntilRu,
} from '../src/lib/profile/profileStatusCore.js'
import { buildClientContacts, buildThreadContacts } from '../src/lib/chat/chatContactsCore.js'
import { buildStaffContacts } from '../src/lib/chat/staffDmContactsCore.js'
import { avatarOp } from '../api/_lib/profile/avatarHandler.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
/** 15.10.2026 14:30 по Москве. */
const NOW = new Date('2026-10-15T11:30:00Z')

console.log('Сроки')
ok(profileStatusUntil('1h', NOW) === '2026-10-15T12:30:00.000Z', '1 час — через час')
ok(profileStatusUntil('today', NOW) === '2026-10-15T21:00:00.000Z', '«Сегодня» — до полуночи по Москве (21:00 UTC)')
ok(profileStatusUntil('today', new Date('2026-10-15T21:30:00Z')) === '2026-10-16T21:00:00.000Z', '«Сегодня» в 00:30 по Москве — до конца уже нового дня')
ok(profileStatusUntil('3d', NOW) === '2026-10-18T11:30:00.000Z' && profileStatusUntil('week', NOW) === '2026-10-22T11:30:00.000Z', '3 дня и неделя')
ok(profileStatusUntil('forever', NOW) === null && profileStatusUntil('year', NOW) === undefined, '«Пока не уберу» — без срока; срок не из списка — undefined')

console.log('Ввод')
const good = checkProfileStatusInput({ emoji: '💪', duration: '1h' }, NOW)
ok(good.ok && good.emoji === '💪' && good.until === '2026-10-15T12:30:00.000Z', 'смайлик из набора + срок')
ok(checkProfileStatusInput({ emoji: '🏖️', duration: 'forever' }, NOW).ok, 'смайлик с вариантом начертания (🏖️) — из набора')
const bad = checkProfileStatusInput({ emoji: '<b>x</b>', duration: '1h' }, NOW)
ok(!bad.ok && bad.error === PROFILE_STATUS_BAD_RU, 'произвольный текст — отказ')
ok(!checkProfileStatusInput({ emoji: '💪', duration: 'year' }, NOW).ok, 'срок не из списка — отказ')
const clear = checkProfileStatusInput({ emoji: null }, NOW)
ok(clear.ok && clear.emoji === null && clear.until === null, 'пустой смайлик — убрать статус')

console.log('Что показать')
ok(activeOwnStatus({ status_emoji: '🔥', status_until: '2026-10-15T12:00:00Z' }, NOW)?.emoji === '🔥', 'срок не вышел — показываем')
ok(activeOwnStatus({ status_emoji: '🔥', status_until: '2026-10-15T11:00:00Z' }, NOW) === null, 'срок вышел — не показываем')
ok(activeOwnStatus({ status_emoji: '🔥', status_until: null }, NOW)?.until === null, 'без срока — показываем всегда')
ok(activeOwnStatus({ status_emoji: '🤡', status_until: null }, NOW) === null, 'в строке не наш смайлик (правили в обход API) — не показываем')
const bday = { status_emoji: '💪', status_until: null, birth_date: '1990-10-15' }
ok(profileStatusEmoji(bday, 'client', NOW) === PROFILE_BIRTHDAY_EMOJI, 'клиент в день рождения — 🎂 вместо своего')
ok(profileStatusEmoji({ ...bday, birth_date: '1990-10-16' }, 'client', NOW) === '💪', 'не день рождения — свой статус')
ok(profileStatusEmoji(bday, 'staff', NOW) === '💪', 'у сотрудника 🎂 не ставим (даты рождения в базе нет)')
ok(profileStatusEmoji({ birth_date: '1990-10-16' }, 'client', new Date('2026-10-15T21:30:00Z')) === PROFILE_BIRTHDAY_EMOJI, 'день рождения — по часам Москвы, а не UTC')
ok(profileStatusEmoji({}, 'client', NOW) === null, 'ничего нет — null')
ok(profileStatusUntilRu('2026-10-15T15:00:00Z', NOW) === 'до 18:00', 'срок сегодня — «до 18:00»')
ok(profileStatusUntilRu('2026-10-18T11:30:00Z', NOW) === 'до 18.10, 14:30', 'срок позже — «до 18.10, 14:30»')
ok(profileStatusUntilRu(null, NOW) === 'без срока', 'без срока')

console.log('Статус в контактах переписки')
const clients = buildClientContacts({ clients: [{ id: A, name: 'Анна', status_emoji: '🔥', status_until: null }, { id: B, name: 'Борис' }], liveClientIds: [], threads: [] })
ok(clients[0].status === '🔥' && clients[1].status === null, 'клиенты тренера — статус у того, кто поставил')
const fromThreads = buildThreadContacts([{ client_id: A, kind: 'supervisor' }], new Map([[A, { name: 'Анна', status_emoji: '😎' }]]))
ok(fromThreads[0].status === '😎', 'папка из диалогов — статус клиента')
const staff = buildStaffContacts({ viewerId: A, peers: [{ id: B, name: 'Ольга', role: 'trainer', status_emoji: '🏖️', status_until: null }], liveUserIds: [], threads: [] })
ok(staff.colleagues[0].status === '🏖️', 'коллеги — статус сотрудника')

console.log('Обработчик')
const rows = { clients: { [A]: { avatar_key: null, status_emoji: null, status_until: null } }, users: { [B]: { avatar_key: null } } }
const db = {
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
const me = { table: 'clients', side: 'client', id: A }
const set = await avatarOp(db, me, 'status', { emoji: '🥳', duration: 'forever' })
ok(set.status === 200 && set.body.status?.emoji === '🥳' && rows.clients[A].status_emoji === '🥳', 'поставить — в своей строке и в ответе')
ok((await avatarOp(db, me, 'get')).body.status?.emoji === '🥳', 'get — свой статус')
const wrong = await avatarOp(db, me, 'status', { emoji: 'javascript:', duration: '1h' })
ok(wrong.status === 400 && rows.clients[A].status_emoji === '🥳', 'не смайлик из набора — 400, строку не трогаем')
const off = await avatarOp(db, me, 'status', { emoji: null })
ok(off.status === 200 && off.body.status === null && rows.clients[A].status_emoji === null && rows.clients[A].status_until === null, 'убрать — смайлик и срок стёрты')
ok((await avatarOp(db, { table: 'users', side: 'client', id: B }, 'status', { emoji: '💪', duration: '1h' })).status === 403, 'таблица не совпадает со стороной — 403')

if (failed) {
  console.error(`\nverify-profile-status: ${failed} проверок не прошло`)
  process.exit(1)
}
console.log('\nverify-profile-status: ok')
