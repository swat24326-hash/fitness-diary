/**
 * Главная /me при нескольких залах: выбор «главного» абона, метки, бонусы, вкладка «От тренера».
 * Канон: docs/CLIENT_APP.md § плитки / бонусы / вкладки.
 */
import { normalizeMembershipHall } from '../membershipHallCore.js'

/** @typedef {'pz'|'tz'|'az'} MembershipHall */

const HALL_RANK = /** @type {const} */ ({ pz: 0, az: 1, tz: 2 })

/**
 * Живые залы по view-строкам абонов (status не upcoming).
 * @param {Array<{ hall?: unknown, status?: string }>|null|undefined} current
 * @returns {Set<MembershipHall>}
 */
export function liveHallsFromMembershipViews(current) {
  /** @type {Set<MembershipHall>} */
  const set = new Set()
  for (const m of current ?? []) {
    if (m?.status === 'upcoming') continue
    const h = normalizeMembershipHall(m?.hall) ?? 'pz'
    set.add(h)
  }
  return set
}

/**
 * Метка зала на плитке: «ПЗ» / «АЗ · Бокс» / «ТЗ».
 * @param {unknown} hall
 * @param {string} [typeLabel] код или имя типа (для АЗ — направление)
 */
export function membershipHallMarkRu(hall, typeLabel = '') {
  const h = normalizeMembershipHall(hall) ?? 'pz'
  if (h === 'tz') return 'ТЗ'
  if (h === 'pz') return 'ПЗ'
  const cleaned = String(typeLabel ?? '')
    .trim()
    .replace(/^АЗ\s*[·•.\-–—]?\s*/i, '')
    .trim()
  return cleaned ? `АЗ · ${cleaned}` : 'АЗ'
}

/**
 * Подпись плитки с префиксом зала: «ПЗ · 4 тренировки списано».
 * @param {string} caption
 * @param {{ hall?: unknown, hall_mark?: string, label?: string }|null|undefined} m
 */
export function withMembershipHallCaption(caption, m) {
  const mark =
    String(m?.hall_mark ?? '').trim() || membershipHallMarkRu(m?.hall, m?.label)
  if (!mark) return caption
  const text = String(caption ?? '').trim()
  if (!text) return mark
  if (text.startsWith(`${mark} ·`) || text.startsWith(`${mark}·`)) return text
  return `${mark} · ${text}`
}

/**
 * Главный абон на главной: среди начавшихся — active; при смеси — срочность, затем ПЗ → АЗ → ТЗ.
 * @param {Array<object>|null|undefined} current
 */
export function pickHomeMembership(current) {
  const list = current ?? []
  const started = list.filter((x) => x.status !== 'upcoming')
  const active = started.filter((x) => x.status === 'active')
  const pool = active.length ? active : started
  if (!pool.length) return list[0] ?? null
  return [...pool].sort((a, b) => {
    const da = Number(a.days_left)
    const db = Number(b.days_left)
    const na = Number.isFinite(da) ? da : Number.POSITIVE_INFINITY
    const nb = Number.isFinite(db) ? db : Number.POSITIVE_INFINITY
    if (na !== nb) return na - nb
    const ra = a.remaining == null ? Number.POSITIVE_INFINITY : Number(a.remaining)
    const rb = b.remaining == null ? Number.POSITIVE_INFINITY : Number(b.remaining)
    const raN = Number.isFinite(ra) ? ra : Number.POSITIVE_INFINITY
    const rbN = Number.isFinite(rb) ? rb : Number.POSITIVE_INFINITY
    if (raN !== rbN) return raN - rbN
    const ha = normalizeMembershipHall(a.hall) ?? 'pz'
    const hb = normalizeMembershipHall(b.hall) ?? 'pz'
    return (HALL_RANK[ha] ?? 9) - (HALL_RANK[hb] ?? 9)
  })[0]
}

/**
 * Блок «Бонусы»: только при открытом ПЗ; solo АЗ/ТЗ — нет; хвост баллов без ПЗ — да.
 * @param {{ memberships?: { current?: object[] }, loyalty?: { points?: unknown }|null }} opts
 */
export function clientShowsLoyaltyBlock(opts = {}) {
  const loyalty = opts.loyalty
  if (!loyalty) return false
  const halls = liveHallsFromMembershipViews(opts.memberships?.current)
  if (halls.has('pz')) return true
  return Number(loyalty.points) > 0
}

/**
 * Тихая подпись: при 2+ живых залах остальные абоны — во «Тренировках».
 * @param {{ current?: Array<{ hall?: unknown, status?: string }> }|null|undefined} memberships
 */
export function clientHomeOtherHallsNote(memberships) {
  const halls = liveHallsFromMembershipViews(memberships?.current)
  if (halls.size < 2) return null
  return 'Остальные абонементы — во вкладке «Тренировки»'
}
