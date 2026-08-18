/**
 * Sync менеджера: клиенты клуба + типы абон. Цифры дня — «Обновить» на продажах.
 */

import { pullAdminClientsFromCloud } from './admin/adminClientsListService.js'
import { recordSyncPullIssue } from './syncHeaderPullIssue.js'

/**
 * @param {{
 *   user?: { club_id?: string } | null,
 *   bump: (n: number, label: string) => void,
 *   parts: string[],
 *   forceFromCloud?: boolean,
 * }} p
 * @returns {Promise<boolean>} hadError
 */
export async function pullHeaderSyncForSales(p) {
  const bump = p.bump
  const parts = p.parts
  const typeOpts = p.forceFromCloud === true ? { forceFromCloud: true } : {}
  let hadError = false
  const club = String(p.user?.club_id ?? '').trim()
  if (club) {
    bump(80, 'Клиенты клуба…')
    try {
      const pull = await pullAdminClientsFromCloud(club)
      if (pull?.ok) {
        parts.push(`клиенты (${pull.count ?? 0})`)
      } else {
        hadError = true
        parts.push(`клиенты: ${pull?.reason ?? pull?.error ?? 'ошибка'}`)
        recordSyncPullIssue('клиенты клуба', pull?.reason ?? pull?.error)
      }
    } catch (e) {
      hadError = true
      parts.push(`клиенты: ${e?.message ?? 'ошибка'}`)
      recordSyncPullIssue('клиенты клуба', e?.message)
    }
    bump(86, 'Типы абонементов…')
    try {
      const { pullMembershipTypesForClubFromCloud } = await import('./pullReferenceData.js')
      const mtPull = await pullMembershipTypesForClubFromCloud(club, typeOpts)
      if (!mtPull?.ok) {
        hadError = true
        parts.push(`типы абон.: ${mtPull.error ?? mtPull.reason ?? 'ошибка'}`)
        recordSyncPullIssue('типы абонементов', mtPull.error ?? mtPull.reason)
      } else {
        parts.push(`типы абон. (${mtPull.count ?? 0})`)
      }
    } catch (e) {
      hadError = true
      parts.push(`типы абон.: ${e?.message ?? 'ошибка'}`)
      recordSyncPullIssue('типы абонементов', e?.message)
    }
  } else {
    hadError = true
    parts.push('клиенты: нет клуба у профиля')
    recordSyncPullIssue('клиенты клуба', 'нет клуба у профиля')
  }
  if (!hadError) bump(88, 'Готово')
  parts.push('отчёт продаж — обновите на странице')
  return hadError
}
