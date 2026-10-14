/**
 * Контекст клуба для админки: память последнего выбранного зала.
 */

const LAST_CLUB_KEY = 'fitness-diary-last-club-v1'

/**
 * @param {string | null | undefined} uid
 * @returns {string | null}
 */
export function readLastAdminClub(uid) {
  if (typeof localStorage === 'undefined' || !uid) return null
  try {
    const raw = localStorage.getItem(LAST_CLUB_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || String(o.uid ?? '') !== String(uid)) return null
    const clubId = String(o.clubId ?? '').trim()
    return clubId || null
  } catch {
    return null
  }
}

/**
 * @param {string | null | undefined} uid
 * @param {string | null | undefined} clubId
 */
export function writeLastAdminClub(uid, clubId) {
  if (typeof localStorage === 'undefined' || !uid) return
  const cid = String(clubId ?? '').trim()
  if (!cid) return
  try {
    localStorage.setItem(
      LAST_CLUB_KEY,
      JSON.stringify({ uid: String(uid), clubId: cid, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Какой club id подставить в URL админки.
 * @param {{
 *   urlClub?: string,
 *   lastClub?: string | null,
 *   validClubIds?: string[],
 *   singleClubId?: string | null,
 * }} opts
 * @returns {string | null}
 */
export function resolveAdminClubId({ urlClub, lastClub, validClubIds = [], singleClubId }) {
  const valid = new Set(validClubIds.map((id) => String(id)))
  const fromUrl = String(urlClub ?? '').trim()
  if (fromUrl && valid.has(fromUrl)) return fromUrl
  if (singleClubId && valid.has(String(singleClubId))) return String(singleClubId)
  const last = String(lastClub ?? '').trim()
  if (last && valid.has(last)) return last
  return null
}

/**
 * Клубы для переключателя админа: демо-клуб прячем, если в облаке есть настоящие.
 * @param {Array<{ id: string|number }>} rows
 * @param {{ hideDemo: boolean, demoClubId: string }} opts
 */
export function visibleAdminClubs(rows, { hideDemo, demoClubId }) {
  const list = Array.isArray(rows) ? rows : []
  if (!hideDemo || list.length <= 1) return list
  return list.filter((c) => String(c.id) !== String(demoClubId))
}

/**
 * Клуб в шапке: на страницах /admin — из адреса; вне их (мессенджер, «Сбои») — последний выбранный.
 * Переключать можно только внутри /admin и только при 2+ клубах.
 * @param {{ onAdminRoute: boolean, urlClub?: string, lastClub?: string | null, clubs: Array<{ id: string|number }> }} opts
 * @returns {{ clubId: string, switchable: boolean }}
 */
export function adminHeaderClub({ onAdminRoute, urlClub, lastClub, clubs }) {
  const ids = clubs.map((c) => String(c.id))
  const single = ids.length === 1 ? ids[0] : null
  const clubId = onAdminRoute
    ? ids.includes(String(urlClub ?? '').trim())
      ? String(urlClub).trim()
      : ''
    : (resolveAdminClubId({ urlClub: '', lastClub, validClubIds: ids, singleClubId: single }) ?? '')
  return { clubId, switchable: onAdminRoute && ids.length > 1 }
}
