/**
 * Ранняя активация upcoming-абонемента (сдвиг дат) перед стартом тренировки.
 */
import { listMemberships } from '../dataAccess.js'
import { getDb } from '../localDb.js'
import { todayLocalIso } from '../dateRu.js'
import { saveLocalWithSync } from '../syncService.js'
import {
  pickEarliestUpcomingMembership,
  pickUsableMembershipForDate,
  proposeEarlyMembershipActivation,
} from '../membershipRules.js'

/**
 * @param {string} clientId
 * @param {string} [activateOnIso]
 */
export async function loadEarlyActivationProposal(clientId, activateOnIso = todayLocalIso()) {
  const day = String(activateOnIso ?? todayLocalIso()).slice(0, 10)
  const memberships = await listMemberships(clientId)
  if (pickUsableMembershipForDate(memberships, day)) {
    return { ok: false, reason: 'has_usable', proposal: null, membership: null }
  }
  const upcoming = pickEarliestUpcomingMembership(memberships, day)
  if (!upcoming) {
    return { ok: false, reason: 'no_upcoming', proposal: null, membership: null }
  }
  const proposal = proposeEarlyMembershipActivation(upcoming, day)
  if (!proposal.ok) {
    return { ok: false, reason: proposal.error, proposal: null, membership: null }
  }
  return { ok: true, reason: null, proposal, membership: upcoming }
}

/**
 * Применить сдвиг дат и сохранить в IDB + очередь sync.
 * @param {string} clientId
 * @param {string} [activateOnIso]
 * @returns {Promise<{ ok: true, membership: object, proposal: object } | { ok: false, error: string }>}
 */
export async function applyEarlyMembershipActivation(clientId, activateOnIso = todayLocalIso()) {
  const day = String(activateOnIso ?? todayLocalIso()).slice(0, 10)
  const loaded = await loadEarlyActivationProposal(clientId, day)
  if (!loaded.ok || !loaded.proposal || !loaded.membership) {
    return {
      ok: false,
      error:
        loaded.reason === 'has_usable'
          ? 'Уже есть действующий абонемент на эту дату'
          : 'Нет абонемента для ранней активации',
    }
  }

  const { membership } = loaded

  const db = await getDb()
  const fresh = await db.get('memberships', membership.id)
  if (!fresh) return { ok: false, error: 'Абонемент не найден локально' }

  const again = proposeEarlyMembershipActivation(fresh, day)
  if (!again.ok) return { ok: false, error: 'Даты абонемента уже изменились — обновите экран' }

  if (pickUsableMembershipForDate(await listMemberships(clientId), day)) {
    return { ok: false, error: 'Уже есть действующий абонемент на эту дату' }
  }

  const next = {
    ...fresh,
    start_date: again.to.start,
    end_date: again.to.end,
  }

  try {
    await saveLocalWithSync('memberships', next, {
      table_name: 'memberships',
      operation: 'update',
      remote_id: fresh.id,
    })
  } catch (e) {
    return { ok: false, error: e?.message || 'Не удалось сохранить даты абонемента' }
  }

  return { ok: true, membership: next, proposal: again }
}
