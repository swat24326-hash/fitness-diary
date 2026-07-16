/**
 * Доска контроля ПНК для менеджера / админа (десятки карточек, сортировка, фильтр).
 */
import { buildPnkGlanceCard, buildPnkGlanceProgressMini } from './pnkTrainerGlanceCore.js'
import { matchesPnkBoardFilter } from './pnkStagesCore.js'

/**
 * @param {object} client — из API (trainer_name, trainer_phone)
 * @param {Date} [now]
 */
export function buildPnkManagerControlCard(client, now = new Date()) {
  const base = buildPnkGlanceCard(client, now)
  if (!base) return null
  return {
    ...base,
    trainerId: String(client?.trainer_id ?? '').trim() || null,
    trainerName: String(client?.trainer_name ?? '').trim() || '—',
    trainerPhone: client?.trainer_phone ? String(client.trainer_phone).trim() : null,
    phone: client?.phone ? String(client.phone).trim() : null,
    client,
    progressMini: buildPnkGlanceProgressMini(base),
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

  const list = []
  for (const c of Array.isArray(clients) ? clients : []) {
    if (!matchesPnkBoardFilter(c, boardFilter, attentionIds)) continue
    if (trainerId && String(c.trainer_id ?? '') !== trainerId) continue
    if (query) {
      const hay = `${c.name ?? ''} ${c.phone ?? ''} ${c.trainer_name ?? ''}`.toLowerCase()
      if (!hay.includes(query)) continue
    }
    const card = buildPnkManagerControlCard(c, now)
    if (card) list.push(card)
  }

  list.sort((a, b) => {
    if (a.isHot !== b.isHot) return a.isHot ? -1 : 1
    if (a.stepN !== b.stepN) return a.stepN - b.stepN
    return a.name.localeCompare(b.name, 'ru')
  })
  return list
}
