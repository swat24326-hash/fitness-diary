/**
 * Сводка ПНК для главной менеджера / админа (без React).
 */
import { isOpenPnkClient } from './pnkStagesCore.js'
import { listPnkAttentionClients } from './pnkStatsAgg.js'

/**
 * @param {object[]} clients
 * @param {Date} [now]
 * @returns {{ openCount: number, attentionCount: number, hotCount: number, hasWork: boolean, isHot: boolean }}
 */
export function buildPnkManagerHomeGlance(clients, now = new Date()) {
  const list = Array.isArray(clients) ? clients : []
  let openCount = 0
  for (const c of list) {
    if (isOpenPnkClient(c)) openCount += 1
  }
  const attention = listPnkAttentionClients(list, now)
  const hotCount = attention.filter((row) => row.tone === 'hot').length
  const attentionCount = attention.length
  return {
    openCount,
    attentionCount,
    hotCount,
    hasWork: openCount > 0,
    isHot: hotCount > 0,
  }
}
