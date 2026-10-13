/**
 * Сотрудники сети столбцами по клубам — для главного админа на широком экране. Без React и базы.
 * Поиск: совпало название клуба — показываем весь клуб; иначе — только люди с совпавшим именем.
 */
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

/**
 * @param {object[]} contacts люди из папок «Тренеры» и «Администрация» (с club_id / club_name)
 * @param {string} [query]
 * @returns {Array<{ key: string, title: string, unread: number, people: object[] }>}
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
    out.push({ ...col, people: [...people].sort(byPerson), unread: people.filter((p) => p.unread).length })
  }
  return out.sort(byColumn)
}
