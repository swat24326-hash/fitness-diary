/**
 * Доска контроля ПНК для менеджера / админа (десятки карточек, сортировка, фильтр).
 */
import { buildPnkGlanceCard } from './pnkTrainerGlanceCore.js'
import { matchesPnkBoardFilter } from './pnkStagesCore.js'
import { peekPnkBzCompletedCount } from './pnkBzCompletedCore.js'

/**
 * @param {object} client — из API (trainer_name, trainer_phone)
 * @param {Date} [now]
 * @param {{ bzCompletedCount?: number }} [ctx]
 */
export function buildPnkManagerControlCard(client, now = new Date(), ctx = {}) {
  const base = buildPnkGlanceCard(client, now, ctx)
  if (!base) return null
  return {
    ...base,
    trainerId: String(client?.trainer_id ?? '').trim() || null,
    trainerName: String(client?.trainer_name ?? '').trim() || '—',
    trainerPhone: client?.trainer_phone ? String(client.trainer_phone).trim() : null,
    phone: client?.phone ? String(client.phone).trim() : null,
    client,
  }
}

/**
 * @param {object[]} clients
 * @param {{
 *   boardFilter?: string,
 *   attentionIds?: Set<string>,
 *   trainerId?: string,
 *   query?: string,
 *   now?: Date,
 *   bzCompletedByClient?: Record<string, number> | null,
 * }} [opts]
 */
export function buildPnkManagerControlCards(clients, opts = {}) {
  const now = opts.now || new Date()
  const boardFilter = opts.boardFilter || 'all'
  const attentionIds = opts.attentionIds
  const trainerId = String(opts.trainerId ?? '').trim()
  const query = String(opts.query ?? '')
    .trim()
    .toLowerCase()
  const bzByClient = opts.bzCompletedByClient ?? null

  const list = []
  for (const c of Array.isArray(clients) ? clients : []) {
    if (!matchesPnkBoardFilter(c, boardFilter, attentionIds)) continue
    if (trainerId && String(c.trainer_id ?? '') !== trainerId) continue
    if (query) {
      const hay = `${c.name ?? ''} ${c.phone ?? ''} ${c.trainer_name ?? ''}`.toLowerCase()
      if (!hay.includes(query)) continue
    }
    const bzCompletedCount = peekPnkBzCompletedCount(bzByClient, c?.id)
    const card = buildPnkManagerControlCard(c, now, { bzCompletedCount })
    if (card) list.push(card)
  }

  list.sort((a, b) => {
    if (a.isHot !== b.isHot) return a.isHot ? -1 : 1
    if (a.stepN !== b.stepN) return a.stepN - b.stepN
    return a.name.localeCompare(b.name, 'ru')
  })
  return list
}

/**
 * Кого показать справа: URL-focus, иначе первый «горящий», иначе первый в списке.
 * @param {{ id: string, isHot?: boolean }[]} cards
 * @param {{ preferredId?: string }} [opts]
 * @returns {string}
 */
export function pickPnkBoardSelectedId(cards, opts = {}) {
  const list = Array.isArray(cards) ? cards : []
  const preferred = String(opts.preferredId ?? '').trim()
  if (preferred && list.some((c) => c.id === preferred)) return preferred
  const hot = list.find((c) => c.isHot)
  if (hot) return hot.id
  return list[0]?.id ?? ''
}
