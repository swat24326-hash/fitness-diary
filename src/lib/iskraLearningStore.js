/**
 * Локальный журнал сигналов самообучения ИСКРЫ (localStorage, офлайн-first).
 */

import { aggregateLearningSignals, extractLearningPlaybooks, extractOwnerCorrections } from './admin/iskraLearningCore.js'

const STORAGE_KEY = 'fitness-diary-iskra-learning-v1'
const MAX_EVENTS_PER_CLUB = 120
const MAX_CLUBS = 8

function readAll() {
  if (typeof localStorage === 'undefined') return { clubs: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { clubs: {} }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : { clubs: {} }
  } catch {
    return { clubs: {} }
  }
}

function writeAll(data) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota */
  }
}

/**
 * @param {object} event normalized event from normalizeLearningEvent
 */
export function recordLocalIskraLearningEvent(event) {
  const clubId = String(event?.club_id ?? '').trim()
  if (!clubId) return

  const all = readAll()
  if (!all.clubs || typeof all.clubs !== 'object') all.clubs = {}

  const list = Array.isArray(all.clubs[clubId]) ? all.clubs[clubId] : []
  list.push({ ...event, local: true })
  all.clubs[clubId] = list.slice(-MAX_EVENTS_PER_CLUB)

  const clubIds = Object.keys(all.clubs)
  if (clubIds.length > MAX_CLUBS) {
    const trimmed = clubIds
      .map((id) => ({
        id,
        last: all.clubs[id]?.[all.clubs[id].length - 1]?.created_at ?? '',
      }))
      .sort((a, b) => String(b.last).localeCompare(String(a.last)))
      .slice(0, MAX_CLUBS)
      .map((x) => x.id)
    const nextClubs = {}
    for (const id of trimmed) nextClubs[id] = all.clubs[id]
    all.clubs = nextClubs
  }

  writeAll(all)
}

/**
 * @param {string} clubId
 * @param {number} [limit]
 */
export function listLocalIskraLearningEvents(clubId, limit = MAX_EVENTS_PER_CLUB) {
  const id = String(clubId ?? '').trim()
  if (!id) return []
  const all = readAll()
  const list = Array.isArray(all.clubs?.[id]) ? all.clubs[id] : []
  return list.slice(-Math.max(1, limit))
}

/**
 * @param {string} clubId
 */
export function getLocalIskraLearningBundle(clubId) {
  const events = listLocalIskraLearningEvents(clubId)
  const signals = aggregateLearningSignals(events)
  return {
    signals,
    playbooks: extractLearningPlaybooks(signals),
    owner_corrections: extractOwnerCorrections(signals),
    phase: 'apply',
    source: 'local',
  }
}

/**
 * @param {string} clubId
 * @param {string[]} eventIds local created_at keys to clear after sync
 */
export function pruneSyncedLocalEvents(clubId, eventIds) {
  const id = String(clubId ?? '').trim()
  if (!id || !eventIds?.length) return
  const drop = new Set(eventIds)
  const all = readAll()
  const list = Array.isArray(all.clubs?.[id]) ? all.clubs[id] : []
  all.clubs[id] = list.filter((e) => !drop.has(e.created_at))
  writeAll(all)
}
