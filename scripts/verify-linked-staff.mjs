/**
 * Совмещённые роли «тренер + управляющий»: правило связи, кто за кого действует в переписке, кому push,
 * подписи «Жалобы и предложения» / «Управляющий», адрес push на телефоне тренера.
 * node scripts/verify-linked-staff.mjs
 */
import {
  hiddenLinkedTrainerIds,
  isLinkedPair,
  LINKED_ROLE_LABEL_RU,
  linkedPersonNames,
  linkedSupervisorFor,
  linkedTrainerBySupervisor,
  linkedTrainerRecipientIds,
  staffLinkCheck,
  staffLinksOf,
} from '../src/lib/chat/linkedStaffCore.js'
import { canStaffReadChat, chatKindLabelRu } from '../src/lib/chat/chatAccessCore.js'
import { staffRoleLabelRu } from '../src/lib/chat/staffDmAccessCore.js'
import { CHAT_FOLDER_COMPLAINTS, buildThreadContacts, chatFolderLabelRu } from '../src/lib/chat/chatContactsCore.js'
import { coachPushUrl } from '../src/lib/push/pushTargetUrlCore.js'
import { linkedSupervisorCtx, staffDmCtx, withLinkedTrainers } from '../api/_lib/chat/linkedStaffStore.js'
import { uniqueByEndpoint } from '../api/_lib/chat/chatPushJob.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const CLUB = 'club-msk'
const T = { id: 't-kuk', role: 'trainer', club_id: CLUB, is_active: true, linked_user_id: 's-kuk', name: 'Кукарек' }
const S = { id: 's-kuk', role: 'supervisor', club_id: CLUB, is_active: true, linked_user_id: 't-kuk', name: 'Кукарек' }
const MATE = { id: 't-mate', role: 'trainer', club_id: CLUB, is_active: true, linked_user_id: null }

// --- правило связи
ok(isLinkedPair(T, S) && isLinkedPair(S, T), 'взаимная ссылка, тренер + управляющий, один клуб — связь есть')
ok(!isLinkedPair(T, { ...S, linked_user_id: null }), 'ссылка в одну сторону — связи нет')
ok(!isLinkedPair(T, { ...S, linked_user_id: 'другой' }), 'управляющий ссылается на другого — связи нет')
ok(!isLinkedPair(T, { ...S, club_id: 'club-spb' }), 'разные клубы — связи нет')
ok(!isLinkedPair(T, { ...S, club_id: '' }) && !isLinkedPair({ ...T, club_id: null }, { ...S, club_id: null }), 'без клуба — связи нет')
ok(!isLinkedPair(T, { ...S, is_active: false }), 'управляющий заблокирован — связи нет')
ok(!isLinkedPair({ ...T, is_active: false }, S), 'тренер заблокирован — связи нет')
ok(!isLinkedPair(T, { ...S, role: 'trainer' }), 'два тренера — связи нет')
ok(!isLinkedPair(T, { ...S, role: 'sales_manager' }), 'тренер + менеджер — не эта связь')
ok(!isLinkedPair(T, { ...S, role: '' }), 'пустая роль — связи нет')
ok(!isLinkedPair(T, { ...S, role: 'admin' }), 'тренер + главный админ — связи нет')
ok(!isLinkedPair(T, null) && !isLinkedPair({ ...T, linked_user_id: 't-kuk' }, { ...T }), 'нет второй строки / сам на себя — связи нет')
ok(isLinkedPair({ ...T, role: 'Тренер' }, { ...S, role: 'Управляющий' }), 'роли кириллицей — тоже связь')

ok(linkedSupervisorFor(T, S) === S, 'тренерская учётка действует за управляющего')
ok(linkedSupervisorFor(S, T) === null, 'управляющий за тренера не действует (обратного пути нет)')
ok(linkedSupervisorFor(MATE, S) === null, 'чужой тренер за управляющего не действует')

ok(JSON.stringify([...hiddenLinkedTrainerIds([T, S, MATE])]) === '["t-kuk"]', 'коллегам скрыта только тренерская учётка связанной пары')
ok(hiddenLinkedTrainerIds([T, { ...S, is_active: false }, MATE]).size === 0, 'связь не действует — тренер снова виден коллегам')

const GENERIC_S = { ...S, name: 'X•fit studio Управляющий' }
const TK = { ...T, name: 'Александр Кукарек' }
ok(linkedPersonNames([TK, GENERIC_S, MATE]).get('s-kuk') === 'Александр Кукарек', 'учётка управляющего «по должности» — коллеги видят ФИО из тренерской')
ok(linkedTrainerBySupervisor([TK, GENERIC_S]).get('s-kuk') === TK, 'управляющий → его тренерская учётка')
ok(linkedPersonNames([TK, { ...GENERIC_S, is_active: false }]).size === 0, 'связь не действует — имя управляющего не подменяем')
ok(linkedPersonNames([{ ...TK, name: '  ' }, GENERIC_S]).size === 0, 'у тренерской нет имени — остаётся имя управляющего')
ok(LINKED_ROLE_LABEL_RU === 'Управляющий · тренер', 'подпись совмещённой роли')

ok(JSON.stringify(linkedTrainerRecipientIds([S, MATE], [T])) === '["t-kuk"]', 'push управляющему → ещё и тренерской учётке')
ok(linkedTrainerRecipientIds([T], [S]).length === 0, 'push тренеру управляющему не дублируется')
ok(linkedTrainerRecipientIds([{ ...S, linked_user_id: 't-mate' }], [MATE]).length === 0, 'односторонняя ссылка — лишнего push нет')

ok(staffLinkCheck(S, T).ok, 'админ: связать управляющего с тренером своего клуба')
ok(staffLinkCheck(S, null).ok, 'админ: снять связь')
ok(!staffLinkCheck(S, { ...T, club_id: 'club-spb' }).ok, 'админ: тренер чужого клуба — отказ')
ok(!staffLinkCheck(T, S).ok, 'админ: перепутаны роли — отказ')
ok(!staffLinkCheck(S, { ...MATE, role: 'sales_manager' }).ok, 'админ: менеджер вместо тренера — отказ')
ok(!staffLinkCheck(S, { ...T, is_active: false }).ok, 'админ: заблокированный тренер — отказ')
ok(!staffLinkCheck(undefined, T).ok && !staffLinkCheck(S, undefined).ok, 'админ: не найден — отказ')
ok(JSON.stringify(staffLinksOf([T, S, MATE])) === '[{"supervisor_id":"s-kuk","trainer_id":"t-kuk"}]', 'Структура: пары «управляющий → тренер»')

// --- подписи и адреса
ok(chatKindLabelRu('supervisor') === 'Жалобы и предложения', 'клиентский диалог управляющему — «Жалобы и предложения»')
ok(staffRoleLabelRu('supervisor') === 'Управляющий' && staffRoleLabelRu('Тренер') === 'Тренер', 'собеседник-сотрудник — по роли, не по диалогу')
ok(chatFolderLabelRu(CHAT_FOLDER_COMPLAINTS, 'trainer') === 'Жалобы и предложения', 'папка «Жалобы и предложения»')
const UUID = '0b3c1f6e-1d2a-4c3b-8e5f-9a7b6c5d4e3f'
ok(coachPushUrl(`/messages/chat/${UUID}/supervisor`) === `/coach/chat/${UUID}/supervisor`, 'push жалобы → диалог на телефоне тренера')
ok(coachPushUrl(`/messages/chat/${UUID}/trainer`) === `/coach/chat/${UUID}`, 'push «Тренер» — как раньше')
ok(coachPushUrl(`/messages/chat/${UUID}/sales`) === '/coach', 'диалог менеджера на телефон тренера не ведёт')
const contacts = buildThreadContacts(
  [{ client_id: 'c1', last_message_at: '2026-10-12T10:00:00Z', last_author: 'client', last_preview: 'Душ', staff_read_at: null }],
  new Map([['c1', { name: 'Гостева Мария' }]]),
)
ok(contacts[0].name === 'Гостева Мария' && contacts[0].unread && contacts[0].has_app, 'жалоба: клиент написал сам — ярко, ждёт ответа')

// --- сервер: от чьего имени и кому push (подменная база)
function fakeDb(users, { missingColumn = false } = {}) {
  return {
    from() {
      const filters = []
      const q = {
        select: () => q,
        eq: (col, v) => (filters.push((r) => String(r[col]) === String(v)), q),
        in: (col, vs) => (filters.push((r) => vs.map(String).includes(String(r[col]))), q),
        not: (col) => (filters.push((r) => r[col] != null), q),
        then: (res, rej) =>
          Promise.resolve(
            missingColumn
              ? { data: null, error: { message: 'column users.linked_user_id does not exist' } }
              : { data: users.filter((r) => filters.every((f) => f(r))), error: null },
          ).then(res, rej),
      }
      return q
    },
  }
}
const ctxOf = (user, db, extra = {}) => ({ supabaseAdmin: db, user: { id: user.id }, profile: user, isTrainer: true, isAdmin: false, ...extra })

const db = fakeDb([T, S, MATE])
const sup = await linkedSupervisorCtx(ctxOf(T, db))
ok(sup?.user.id === 's-kuk' && sup.isSupervisor && !sup.isTrainer && !sup.isAdmin, 'сервер: связанный тренер → контекст управляющего')
const client = { id: 'c1', club_id: CLUB, trainer_id: 't-mate' }
ok(canStaffReadChat(sup, 'supervisor', client), '…и он читает «Жалобы и предложения» клиента клуба')
ok(!canStaffReadChat(sup, 'trainer', client), '…но не чужой диалог «Тренер»')
ok(!canStaffReadChat(ctxOf(T, db), 'supervisor', client), 'без связи тренер «Жалобы и предложения» не читает')
ok((await linkedSupervisorCtx(ctxOf(MATE, db))) === null, 'сервер: тренер без связи — за управляющего не действует')
ok((await linkedSupervisorCtx(ctxOf(T, fakeDb([T, { ...S, linked_user_id: null }, MATE])))) === null, 'сервер: связь сняли с одной стороны — сразу не действует')
ok((await linkedSupervisorCtx(ctxOf(T, fakeDb([T, { ...S, is_active: false }])))) === null, 'сервер: управляющего заблокировали — не действует')
ok((await linkedSupervisorCtx(ctxOf(S, db, { isTrainer: false, isSupervisor: true }))) === null, 'сервер: управляющий не превращается в тренера')
ok((await linkedSupervisorCtx(ctxOf(T, db, { isAdmin: true }))) === null, 'сервер: админ не идёт через связь')
ok((await linkedSupervisorCtx(ctxOf(T, fakeDb([], { missingColumn: true })))) === null, 'до миграции: связей нет, ошибки нет')
const mateCtx = ctxOf(MATE, db)
ok((await staffDmCtx(mateCtx)) === mateCtx, 'личные: обычный тренер пишет от себя')
ok((await staffDmCtx(ctxOf(T, db))).user.id === 's-kuk', 'личные: связанный тренер пишет от управляющего')

ok(JSON.stringify((await withLinkedTrainers(db, ['s-kuk'])).sort()) === '["s-kuk","t-kuk"]', 'push управляющему → и на устройства тренера')
ok(JSON.stringify(await withLinkedTrainers(db, ['t-mate'])) === '["t-mate"]', 'push обычному тренеру — без добавок')
ok(JSON.stringify(await withLinkedTrainers(fakeDb([], { missingColumn: true }), ['s-kuk'])) === '["s-kuk"]', 'до миграции — push как раньше')
const subs = uniqueByEndpoint([
  { id: 1, endpoint: 'https://push/1' },
  { id: 2, endpoint: 'https://push/1' },
  { id: 3, endpoint: 'https://push/2' },
])
ok(subs.length === 2 && subs[0].id === 1, 'один планшет под двумя учётками — один push')

console.log('verify-linked-staff: all passed')
