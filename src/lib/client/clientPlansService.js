/**
 * Задание от тренера и рацион: POST /api/client-me { action: 'plan-*' }.
 * Удачные ответы кладём в localStorage: без сети клиент видит последнее загруженное, а не пустой экран.
 */
import { CLIENT_PLANS_CACHE_KEY, ClientSessionGoneError, postClientMe } from './clientSession.js'

const KEEP_ITEMS = 6

function readCache() {
  try {
    const c = JSON.parse(window.localStorage.getItem(CLIENT_PLANS_CACHE_KEY) || 'null')
    return { lists: c?.lists ?? {}, items: c?.items ?? {} }
  } catch {
    return { lists: {}, items: {} }
  }
}

function writeCache(patch) {
  const next = { ...readCache(), ...patch }
  const recent = Object.values(next.items)
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, KEEP_ITEMS)
  next.items = Object.fromEntries(recent.map((it) => [it.id, it]))
  try {
    window.localStorage.setItem(CLIENT_PLANS_CACHE_KEY, JSON.stringify(next))
  } catch {
    /* приватный режим Safari / нет места — живём без кэша */
  }
}

/** @returns {Promise<{ items: object[], offline: boolean }>} */
export async function fetchClientPlanList(kind) {
  try {
    const data = await postClientMe({ action: 'plan-list', kind })
    const items = Array.isArray(data?.items) ? data.items : []
    writeCache({ lists: { ...readCache().lists, [kind]: items } })
    return { items, offline: false }
  } catch (e) {
    const cached = readCache().lists[kind]
    if (e instanceof ClientSessionGoneError || !cached) throw e
    return { items: cached, offline: true }
  }
}

/** Открыть задание — сервер заодно отмечает «клиент открыл». @returns {Promise<{ item: object, offline: boolean }>} */
export async function fetchClientPlanItem(id) {
  try {
    const data = await postClientMe({ action: 'plan-item', id })
    writeCache({ items: { ...readCache().items, [data.item.id]: data.item } })
    return { item: data.item, offline: false }
  } catch (e) {
    const cached = readCache().items[id]
    if (e instanceof ClientSessionGoneError || !cached) throw e
    return { item: cached, offline: true }
  }
}
