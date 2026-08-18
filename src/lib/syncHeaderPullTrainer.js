/**
 * Sync тренера: рабочая область, glance баллов в фоне, справочники клубов.
 */

import { collectTrainerClubIds } from './challengeService.js'
import { pullTrainerWorkspaceFromCloud } from './trainerPullService.js'
import { recordSyncPullIssue } from './syncHeaderPullIssue.js'

/**
 * @param {{
 *   user: { id?: string, club_id?: string },
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
export async function pullHeaderSyncForTrainer(p) {
  const bump = p.bump
  const parts = p.parts
  const refs = p.refs
  const user = p.user
  const refOpts = p.forceFromCloud === true ? { forceFromCloud: true } : {}
  let hadError = false

  bump(84, 'Клиенты и тренировки…')
  const pull = await pullTrainerWorkspaceFromCloud(user.id)
  if (pull?.ok) {
    let msg = `рабочая область (${pull.count ?? 0} кл.)`
    if ((pull.pruned_clients ?? 0) > 0) msg += `, убрано из кэша: ${pull.pruned_clients}`
    parts.push(msg)
    void import('./loyalty/loyaltyGlanceService.js')
      .then(({ refreshLoyaltyGlanceAfterTrainerPull }) =>
        refreshLoyaltyGlanceAfterTrainerPull(user.id),
      )
      .catch(() => {})
  } else {
    hadError = true
    parts.push(`тренер: ${pull?.error ?? 'ошибка'}`)
    recordSyncPullIssue('рабочая область', pull?.error)
  }
  const clubIds = await collectTrainerClubIds(user.id, user?.club_id)
  let chTotal = 0
  let chPruned = 0
  let chFailed = false
  const clubList = [...clubIds]
  for (let ci = 0; ci < clubList.length; ci++) {
    const cid = clubList[ci]
    if (clubList.length > 1) {
      bump(90 + Math.round(((ci + 1) / clubList.length) * 8), 'Челленджи…')
    } else {
      bump(94, 'Челленджи…')
    }
    const chPull = await refs.pullChallengesForClubFromCloud(cid)
    if (!chPull?.ok) {
      chFailed = true
      hadError = true
      parts.push(`челленджи: ${chPull.error ?? 'ошибка'}`)
      recordSyncPullIssue('челленджи', chPull.error)
      break
    }
    chTotal += chPull.count ?? 0
    chPruned += chPull.pruned ?? 0
    const mtPull = await refs.pullMembershipTypesForClubFromCloud(cid, refOpts)
    if (!mtPull?.ok) {
      chFailed = true
      hadError = true
      parts.push(`типы абон.: ${mtPull.error ?? 'ошибка'}`)
      recordSyncPullIssue('типы абонементов', mtPull.error)
      break
    }
    const npPull = await refs.pullNutritionProductsForClubFromCloud(cid, refOpts)
    if (!npPull?.ok) {
      chFailed = true
      hadError = true
      parts.push(`питание: ${npPull.error ?? 'ошибка'}`)
      recordSyncPullIssue('питание', npPull.error)
      break
    }
    const hwPull = await refs.pullHomeworkPresetsForClubFromCloud(cid, refOpts)
    if (!hwPull?.ok) {
      chFailed = true
      hadError = true
      parts.push(`ДЗ: ${hwPull.error ?? 'ошибка'}`)
      recordSyncPullIssue('шаблоны ДЗ', hwPull.error)
      break
    }
  }
  if (!chFailed) {
    let chMsg = `челленджи (${chTotal})`
    if (chPruned > 0) chMsg += `, убрано ${chPruned}`
    parts.push(chMsg)
  }
  return hadError
}
