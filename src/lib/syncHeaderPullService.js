/**
 * Pull после flush ручного Sync. Роли — отдельные файлы. Не меняет порядок flush → pull.
 */

import { pullHeaderSyncForAdmin } from './syncHeaderPullAdmin.js'
import { pullHeaderSyncForSales } from './syncHeaderPullSales.js'
import { pullHeaderSyncForTrainer } from './syncHeaderPullTrainer.js'
import { resolveHeaderSyncPullRole } from './syncHeaderPullRoleCore.js'
import { recordSyncPullIssue } from './syncHeaderPullIssue.js'

export { resolveHeaderSyncForceFromCloud, resolveHeaderSyncPullRole } from './syncHeaderPullRoleCore.js'

/**
 * @param {{
 *   isSalesManager?: boolean,
 *   isAdmin?: boolean,
 *   user?: { id?: string, club_id?: string } | null,
 *   clubFromUrl?: string,
 *   forceFromCloud?: boolean,
 *   bump: (n: number, label: string) => void,
 *   parts: string[],
 * }} p
 * @returns {Promise<boolean>} hadError
 */
export async function runHeaderSyncPull(p = {}) {
  const bump = p.bump
  const parts = p.parts
  if (typeof bump !== 'function' || !Array.isArray(parts)) return false

  const forceFromCloud = p.forceFromCloud === true
  const role = resolveHeaderSyncPullRole(p)
  if (role === 'sales') {
    return pullHeaderSyncForSales({ user: p.user, bump, parts, forceFromCloud })
  }

  const refs = await import('./pullReferenceData.js')
  bump(76, 'Справочник упражнений…')
  // Sync вручную — сразу свежие правки админа. exercises-meta по created_at правки без новой записи не ловит.
  const ex = await refs.pullExercisesFromCloud({ force: true })
  let hadError = false
  if (ex?.ok) {
    parts.push('справочник')
  } else {
    hadError = true
    const err = ex?.error ?? ex?.reason ?? 'ошибка'
    parts.push(`справочник: ${err}`)
    recordSyncPullIssue('справочник', err)
  }

  if (role === 'admin') {
    const roleErr = await pullHeaderSyncForAdmin({
      clubFromUrl: p.clubFromUrl,
      bump,
      parts,
      refs,
      forceFromCloud,
    })
    return Boolean(hadError || roleErr)
  }
  if (role === 'trainer') {
    const roleErr = await pullHeaderSyncForTrainer({ user: p.user, bump, parts, refs, forceFromCloud })
    return Boolean(hadError || roleErr)
  }
  return hadError
}
