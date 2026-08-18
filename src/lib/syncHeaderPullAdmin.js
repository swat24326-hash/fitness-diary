/**
 * Sync админа по клубу из URL: клиенты, челленджи, типы, питание, ДЗ.
 */

import { pullAdminClientsFromCloud } from './admin/adminClientsListService.js'
import { recordSyncPullIssue } from './syncHeaderPullIssue.js'

/**
 * @param {{
 *   clubFromUrl?: string,
 *   bump: (n: number, label: string) => void,
 *   parts: string[],
 *   refs: {
 *     pullChallengesForClubFromCloud: Function,
 *     pullMembershipTypesForClubFromCloud: Function,
 *     pullNutritionProductsForClubFromCloud: Function,
 *     pullHomeworkPresetsForClubFromCloud: Function,
 *   },
 *   forceFromCloud?: boolean,
 * }} p
 * @returns {Promise<boolean>} hadError
 */
export async function pullHeaderSyncForAdmin(p) {
  const bump = p.bump
  const parts = p.parts
  const refs = p.refs
  const refOpts = p.forceFromCloud === true ? { forceFromCloud: true } : {}
  let hadError = false
  const club = String(p.clubFromUrl ?? '').trim()
  if (!club) {
    parts.push('клиенты: выберите клуб')
    return true
  }
  bump(82, 'Клиенты клуба…')
  const { listChallengesLocalForClub, pushChallengeToCloud } = await import('./challengeService.js')
  for (const ch of await listChallengesLocalForClub(club)) {
    await pushChallengeToCloud(ch)
  }
  const pull = await pullAdminClientsFromCloud(club)
  if (pull?.ok) {
    let msg = `клиенты (${pull.count ?? 0})`
    if ((pull.pruned_clients ?? 0) > 0 || (pull.pruned_trainings ?? 0) > 0) {
      msg += `, очищено кэша: ${pull.pruned_clients ?? 0} кл. / ${pull.pruned_trainings ?? 0} черн.`
    }
    parts.push(msg)
  } else {
    hadError = true
    parts.push(`клиенты: ${pull?.reason ?? pull?.error ?? 'ошибка'}`)
    recordSyncPullIssue('клиенты клуба', pull?.reason ?? pull?.error)
  }
  bump(92, 'Челленджи…')
  const chPull = await refs.pullChallengesForClubFromCloud(club)
  if (!chPull?.ok) {
    hadError = true
    parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
    recordSyncPullIssue('челленджи', chPull.error)
  } else {
    let chMsg = `челленджи (${chPull.count ?? 0})`
    if ((chPull.pruned ?? 0) > 0) chMsg += `, убрано ${chPull.pruned}`
    parts.push(chMsg)
  }
  bump(94, 'Типы абонементов…')
  const mtPull = await refs.pullMembershipTypesForClubFromCloud(club, refOpts)
  if (!mtPull?.ok) {
    hadError = true
    parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
    recordSyncPullIssue('типы абонементов', mtPull.error)
  } else {
    parts.push(`типы абон. (${mtPull.count ?? 0})`)
  }
  bump(95, 'Продукты питания…')
  const npPull = await refs.pullNutritionProductsForClubFromCloud(club, refOpts)
  if (!npPull?.ok) {
    hadError = true
    parts.push(`питание: ${npPull.error ?? 'ошибка'}`)
    recordSyncPullIssue('питание', npPull.error)
  } else {
    parts.push(`питание (${npPull.count ?? 0})`)
  }
  bump(96, 'Шаблоны ДЗ…')
  const hwPull = await refs.pullHomeworkPresetsForClubFromCloud(club, refOpts)
  if (!hwPull?.ok) {
    hadError = true
    parts.push(`ДЗ: ${hwPull.error ?? 'ошибка'}`)
    recordSyncPullIssue('шаблоны ДЗ', hwPull.error)
  } else {
    parts.push(`ДЗ (${hwPull.count ?? 0})`)
  }
  return hadError
}
