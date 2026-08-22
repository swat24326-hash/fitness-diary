/**
 * Карточки ПНК для виджета на главной менеджера / админа (как glance заданий).
 */
import { buildPnkManagerControlCards } from './pnkManagerBoardCore.js'
import { isOpenPnkClient } from './pnkStagesCore.js'
import { listPnkAttentionClients } from './pnkStatsAgg.js'

/**
 * @param {object[]} clients
 * @param {Date} [now]
 * @param {{ bzCompletedByClient?: Record<string, number> | null }} [opts]
 */
export function buildPnkManagerHomeGlance(clients, now = new Date(), opts = {}) {
  const list = Array.isArray(clients) ? clients : []
  let openCount = 0
  for (const c of list) {
    if (isOpenPnkClient(c)) openCount += 1
  }
  const attention = listPnkAttentionClients(list, now, {
    bzCompletedByClient: opts.bzCompletedByClient ?? null,
  })
  const hotCount = attention.filter((row) => row.tone === 'hot').length
  return {
    openCount,
    attentionCount: attention.length,
    hotCount,
    hasWork: openCount > 0,
    isHot: hotCount > 0,
  }
}

/**
 * Карточки для карусели на главной (стрелки как у планёрки / тренера).
 * @param {object[]} clients
 * @param {{ boardHref?: string, now?: Date, bzCompletedByClient?: Record<string, number> | null }} [opts]
 */
export function buildPnkManagerHomeGlanceCards(clients, opts = {}) {
  const boardHref = String(opts.boardHref ?? '/sales/pnk').trim() || '/sales/pnk'
  const now = opts.now || new Date()
  const sep = boardHref.includes('?') ? '&' : '?'

  return buildPnkManagerControlCards(clients, {
    boardFilter: 'all',
    now,
    bzCompletedByClient: opts.bzCompletedByClient ?? null,
  }).map((card) => {
    const id = String(card.id ?? '').trim()
    const trainerLine = card.trainerName && card.trainerName !== '—' ? `Тренер: ${card.trainerName}` : ''
    return {
      id: card.id,
      name: card.name,
      stepN: card.stepN,
      stepTotal: card.stepTotal,
      stepTitle: card.stepTitle,
      caption: card.caption,
      isHot: card.isHot,
      hotLabel: card.hotLabel,
      trainerName: card.trainerName,
      href: id ? `${boardHref}${sep}focus=${encodeURIComponent(id)}` : boardHref,
      fromLine: trainerLine
        ? `Шаг ${card.stepN} из ${card.stepTotal} · ${card.stepTitle} · ${trainerLine}`
        : `Шаг ${card.stepN} из ${card.stepTotal} · ${card.stepTitle}`,
    }
  })
}
