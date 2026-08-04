/**
 * Фильтр вкладки АЗ по направлению (membership_types АЗ: Бокс, Степ…).
 * Чистая логика без React / IDB.
 */

import { pickHallActiveMembership, deskAzDirectionLabel } from './deskMembershipLedgerCore.js'

/** Все направления */
export const AZ_DIRECTION_FILTER_ALL = ''
/** Нет membership_type_id у актуального / последнего абона */
export const AZ_DIRECTION_FILTER_NONE = '__none__'

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAzDirectionFilterId(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === 'all' || s === '*') return AZ_DIRECTION_FILTER_ALL
  if (s === 'none' || s === 'без' || s === AZ_DIRECTION_FILTER_NONE) {
    return AZ_DIRECTION_FILTER_NONE
  }
  return s
}

/**
 * Направление клиента АЗ: сначала действующий абон (срок+занятия), иначе последний по датам.
 * @param {object[]|null|undefined} memList
 * @param {string} [todayIso]
 * @returns {string} membership_type_id или ''
 */
export function resolveAzClientDirectionTypeId(memList, todayIso) {
  const active = pickHallActiveMembership(memList, todayIso, 'az')
  const fromActive = String(active?.membership_type_id ?? '').trim()
  if (fromActive) return fromActive

  const list = Array.isArray(memList) ? memList : []
  if (!list.length) return ''

  const sorted = [...list].sort((a, b) => {
    const endCmp = String(b?.end_date ?? '').localeCompare(String(a?.end_date ?? ''))
    if (endCmp) return endCmp
    return String(b?.start_date ?? '').localeCompare(String(a?.start_date ?? ''))
  })
  for (const m of sorted) {
    const id = String(m?.membership_type_id ?? '').trim()
    if (id) return id
  }
  return ''
}

/**
 * @param {object[]|null|undefined} memList
 * @param {string} filterId — '' | '__none__' | type uuid
 * @param {string} [todayIso]
 */
export function clientMatchesAzDirectionFilter(memList, filterId, todayIso) {
  const want = normalizeAzDirectionFilterId(filterId)
  if (!want) return true
  const got = resolveAzClientDirectionTypeId(memList, todayIso)
  if (want === AZ_DIRECTION_FILTER_NONE) return !got
  return got === want
}

/**
 * Чипы фильтра: Все + типы с ненулевым count + «Без направления».
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>|Map<string, object[]>,
 *   azTypes?: Array<{ id?: string, name?: string, code?: string }>,
 *   todayIso?: string,
 * }} input
 * @returns {Array<{ id: string, label: string, count: number }>}
 */
export function buildAzDirectionFilterOptions(input) {
  const clients = input?.clients ?? []
  const azTypes = Array.isArray(input?.azTypes) ? input.azTypes : []
  const today = input?.todayIso
  const memBy = input?.memByClient

  const getMem = (clientId) => {
    const id = String(clientId ?? '')
    if (!id) return []
    if (memBy instanceof Map) return memBy.get(id) ?? []
    if (memBy && typeof memBy === 'object') return memBy[id] ?? []
    return []
  }

  /** @type {Map<string, number>} */
  const byType = new Map()
  let noneCount = 0
  for (const c of clients) {
    const cid = String(c?.id ?? '').trim()
    if (!cid) continue
    const typeId = resolveAzClientDirectionTypeId(getMem(cid), today)
    if (!typeId) {
      noneCount += 1
      continue
    }
    byType.set(typeId, (byType.get(typeId) || 0) + 1)
  }

  /** @type {Array<{ id: string, label: string, count: number }>} */
  const options = [
    {
      id: AZ_DIRECTION_FILTER_ALL,
      label: 'Все направления',
      count: clients.length,
    },
  ]

  for (const t of azTypes) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const count = byType.get(id) || 0
    if (count <= 0) continue
    options.push({
      id,
      label: deskAzDirectionLabel(id, azTypes),
      count,
    })
    byType.delete(id)
  }

  // Типы, которых нет в справочнике (старые id), но есть у клиентов
  for (const [id, count] of byType) {
    if (count <= 0) continue
    options.push({
      id,
      label: deskAzDirectionLabel(id, azTypes) === '—' ? `Тип ${id.slice(0, 8)}` : deskAzDirectionLabel(id, azTypes),
      count,
    })
  }

  if (noneCount > 0) {
    options.push({
      id: AZ_DIRECTION_FILTER_NONE,
      label: 'Без направления',
      count: noneCount,
    })
  }

  return options
}
