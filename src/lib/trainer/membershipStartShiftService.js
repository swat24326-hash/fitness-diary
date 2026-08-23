/**
 * Сдвиг дат абонемента перед стартом тренировки:
 * early — upcoming раньше планового старта;
 * late — первая тренировка после start_date (окно ≤14 дней, used=0 по полю и дневнику).
 */
import { listMemberships, listTrainingsForClient } from '../dataAccess.js'
import { getDb } from '../localDb.js'
import { todayLocalIso } from '../dateRu.js'
import { saveLocalWithSync } from '../syncService.js'
import { notifyAdminClientsBrowseStorageChanged } from './admin/adminClientsListReloadCore.js'
import {
  inspectLateMembershipStart,
  pickEarliestUpcomingMembership,
  pickUsableMembershipForDate,
  proposeEarlyMembershipActivation,
  proposeLateMembershipStart,
} from '../membershipRules.js'

/**
 * @param {string} clientId
 * @param {string} [activateOnIso]
 */
export async function loadEarlyActivationProposal(clientId, activateOnIso = todayLocalIso()) {
  const day = String(activateOnIso ?? todayLocalIso()).slice(0, 10)
  const memberships = await listMemberships(clientId)
  if (pickUsableMembershipForDate(memberships, day)) {
    return { ok: false, reason: 'has_usable', proposal: null, membership: null, mode: 'early' }
  }
  const upcoming = pickEarliestUpcomingMembership(memberships, day)
  if (!upcoming) {
    return { ok: false, reason: 'no_upcoming', proposal: null, membership: null, mode: 'early' }
  }
  const proposal = proposeEarlyMembershipActivation(upcoming, day)
  if (!proposal.ok) {
    return { ok: false, reason: proposal.error, proposal: null, membership: null, mode: 'early' }
  }
  return { ok: true, reason: null, proposal, membership: upcoming, mode: 'early' }
}

/**
 * Полный разбор позднего старта (offer / blocked / skip) с дневником.
 * @param {string} clientId
 * @param {string} [activateOnIso]
 */
export async function loadLateStartInspection(clientId, activateOnIso = todayLocalIso()) {
  const day = String(activateOnIso ?? todayLocalIso()).slice(0, 10)
  const [memberships, trainings] = await Promise.all([
    listMemberships(clientId),
    listTrainingsForClient(clientId),
  ])
  const inspection = inspectLateMembershipStart(memberships, day, trainings)
  return { ...inspection, mode: 'late', day, memberships, trainings }
}

/**
 * @param {string} clientId
 * @param {string} [activateOnIso]
 */
export async function loadLateStartProposal(clientId, activateOnIso = todayLocalIso()) {
  const inspection = await loadLateStartInspection(clientId, activateOnIso)
  if (inspection.status === 'offer' && inspection.proposal && inspection.membership) {
    return {
      ok: true,
      reason: null,
      proposal: inspection.proposal,
      membership: inspection.membership,
      mode: 'late',
      inspection,
    }
  }
  return {
    ok: false,
    reason: inspection.reason || 'skip',
    proposal: null,
    membership: inspection.membership,
    mode: 'late',
    inspection,
  }
}

/**
 * @param {object} membership
 * @param {{ start: string, end: string }} to
 * @param {'early' | 'late'} mode
 */
async function persistMembershipDates(membership, to, _mode) {
  const next = {
    ...membership,
    start_date: to.start,
    end_date: to.end,
  }
  await saveLocalWithSync('memberships', next, {
    table_name: 'memberships',
    operation: 'update',
    remote_id: membership.id,
  })
  notifyAdminClientsBrowseStorageChanged({
    reason: 'membership-dates-shifted',
    clientId: next.client_id,
    clubId: next.club_id,
  })
  return next
}

/**
 * Применить ранний сдвиг дат и сохранить в IDB + очередь sync.
 * @param {string} clientId
 * @param {string} [activateOnIso]
 * @returns {Promise<{ ok: true, membership: object, proposal: object, mode: 'early' } | { ok: false, error: string }>}
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

  try {
    const next = await persistMembershipDates(fresh, again.to, 'early')
    return { ok: true, membership: next, proposal: again, mode: 'early' }
  } catch (e) {
    return { ok: false, error: e?.message || 'Не удалось сохранить даты абонемента' }
  }
}

/**
 * Применить сдвиг от первой тренировки (после старта).
 * @param {string} clientId
 * @param {string} [activateOnIso]
 * @returns {Promise<{ ok: true, membership: object, proposal: object, mode: 'late' } | { ok: false, error: string }>}
 */
export async function applyLateMembershipStart(clientId, activateOnIso = todayLocalIso()) {
  const day = String(activateOnIso ?? todayLocalIso()).slice(0, 10)
  const loaded = await loadLateStartProposal(clientId, day)
  if (!loaded.ok || !loaded.proposal || !loaded.membership) {
    const reason = loaded.reason
    let error = 'Нельзя сдвинуть срок абонемента'
    if (reason === 'already_used') error = 'По абонементу уже есть занятия (в учёте или в дневнике)'
    else if (reason === 'too_late') error = 'С даты старта прошло больше 14 дней — срок не сдвигаем'
    else if (reason === 'overlap') error = 'Новые даты пересекаются с другим абонементом'
    else if (reason === 'already_aligned') error = 'Срок уже совпадает с датой тренировки'
    return { ok: false, error }
  }

  const { membership } = loaded
  const db = await getDb()
  const fresh = await db.get('memberships', membership.id)
  if (!fresh) return { ok: false, error: 'Абонемент не найден локально' }

  const [memberships, trainings] = await Promise.all([
    listMemberships(clientId),
    listTrainingsForClient(clientId),
  ])
  const again = proposeLateMembershipStart(fresh, day, {
    otherMemberships: memberships,
    clientTrainings: trainings,
  })
  if (!again.ok) {
    if (again.error === 'overlap') {
      return { ok: false, error: 'Новые даты пересекаются с другим абонементом' }
    }
    if (again.error === 'already_used') {
      return { ok: false, error: 'По абонементу уже есть занятия (в учёте или в дневнике)' }
    }
    return { ok: false, error: 'Даты абонемента уже изменились — обновите экран' }
  }

  try {
    const next = await persistMembershipDates(fresh, again.to, 'late')
    return { ok: true, membership: next, proposal: again, mode: 'late' }
  } catch (e) {
    return { ok: false, error: e?.message || 'Не удалось сохранить даты абонемента' }
  }
}
