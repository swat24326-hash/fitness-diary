/**
 * Сотрудники сети столбцами по клубам — для главного админа на широком экране. Без React и базы.
 * Поиск: совпало название клуба — показываем весь клуб; иначе — только люди с совпавшим именем.
 */
import { pluralRu } from '../client/clientMeUiCore.js'
import { normalizeQuery } from './chatContactsCore.js'
import { LINKED_ROLE_LABEL_RU } from './linkedStaffCore.js'
import { staffRoleLabelRu } from './staffDmAccessCore.js'

export const NETWORK_COLUMN_RU = 'Сеть'
const ROLE_RANK = { admin: 0, supervisor: 1, sales: 2, trainer: 3 }
const collator = new Intl.Collator('ru', { sensitivity: 'base' })

function byPerson(a, b) {
  return (
    Number(b.unread) - Number(a.unread) ||
    Number(b.has_app) - Number(a.has_app) ||
    (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) ||
    collator.compare(a.name || '', b.name || '')
  )
}

function byColumn(a, b) {
  return (
    Number(b.key === '') - Number(a.key === '') ||
    Number(b.unread > 0) - Number(a.unread > 0) ||
    collator.compare(a.title, b.title)
  )
}

/** Кому реально дойдёт сейчас: есть приложение или уже идёт переписка. Остальные — свёрнутой группой внизу столбца. */
export function isStaffReachable(p) {
  return Boolean(p.has_app || p.has_thread || p.unread)
}

/**
 * @param {object[]} contacts люди из папок «Тренеры» и «Администрация» (с club_id / club_name)
 * @param {string} [query]
 * @returns {Array<{ key: string, title: string, unread: number, people: object[], reachable: object[], idle: object[] }>}
 */
export function buildStaffColumns(contacts, query = '') {
  const q = normalizeQuery(query)
  const columns = new Map()
  for (const c of contacts ?? []) {
    const title = String(c.club_name ?? '').trim()
    const key = title ? String(c.club_id ?? title) : ''
    if (!columns.has(key)) columns.set(key, { key, title: title || NETWORK_COLUMN_RU, people: [] })
    columns.get(key).people.push({ ...c, role_label: c.linked_trainer ? LINKED_ROLE_LABEL_RU : staffRoleLabelRu(c.role) })
  }
  const out = []
  for (const col of columns.values()) {
    const clubHit = !q || normalizeQuery(col.title).includes(q)
    const people = clubHit ? col.people : col.people.filter((p) => normalizeQuery(p.name).includes(q))
    if (!people.length) continue
    const sorted = [...people].sort(byPerson)
    out.push({
      ...col,
      people: sorted,
      reachable: sorted.filter(isStaffReachable),
      idle: sorted.filter((p) => !isStaffReachable(p)),
      unread: people.filter((p) => p.unread).length,
    })
  }
  return out.sort(byColumn)
}

export const STAFF_VIEW_ALL = 'all'
export const STAFF_VIEW_UNREAD = 'unread'

/**
 * Список клубов слева (как папки Telegram): «Все», «Ждут ответа», затем клубы.
 * @returns {Array<{ key: string, title: string, unread: number, total: number }>}
 */
export function staffClubRail(columns) {
  const total = columns.reduce((n, c) => n + c.people.length, 0)
  const unread = columns.reduce((n, c) => n + c.unread, 0)
  return [
    { key: STAFF_VIEW_ALL, title: 'Все клубы', unread, total },
    { key: STAFF_VIEW_UNREAD, title: 'Ждут ответа', unread, total: unread },
    ...columns.map((c) => ({ key: `club:${c.key}`, title: c.title, unread: c.unread, total: c.people.length })),
  ]
}

/**
 * Что показать в списке людей: всё / только ждущих ответа / один клуб. При поиске — всегда все совпадения по клубам.
 * Выбранного клуба больше нет (сняли фильтр, клуб пуст) — все.
 */
export function pickStaffSections(columns, view, searching = false) {
  if (searching || view === STAFF_VIEW_ALL) return columns
  if (view === STAFF_VIEW_UNREAD) {
    return columns
      .map((c) => {
        const people = c.people.filter((p) => p.unread)
        return { ...c, people, reachable: people, idle: [] }
      })
      .filter((c) => c.people.length)
  }
  const one = columns.filter((c) => `club:${c.key}` === view)
  return one.length ? one : columns
}

/** Подпись под поиском: «Нашли 3 в 2 клубах». */
export function staffColumnsFoundRu(columns) {
  const people = columns.reduce((n, c) => n + c.people.length, 0)
  if (!people) return 'Никого не нашли'
  const clubs = columns.length
  return `Нашли ${people} · ${clubs} ${pluralRu(clubs, 'клуб', 'клуба', 'клубов')}`
}
