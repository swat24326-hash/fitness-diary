/**
 * Сохранение черновика при переключении вкладок (сплит клиентов).
 * liveDraftRef обновляется синхронно при вводе; gate — на следующий layout.
 * При уходе с вкладки берём live, иначе в session попадает устаревший/пустой снимок.
 */

import { buildTrainingDraftSessionSnapshot, isTrainingDraftSessionSnapshotReady, putTrainingDraftSession } from './trainingDraftSessionCache.js'

/**
 * @param {string | null | undefined} leavingId
 * @param {{
 *   live?: {
 *     loadState?: string,
 *     meta?: { status?: string, trainingId?: string | null },
 *     workoutState?: object,
 *     trainingType?: string,
 *     trainingDate?: string,
 *     client?: { id?: string } | null,
 *   } | null,
 *   gate?: { id?: string, snap?: object } | null,
 * }} ctx
 * @returns {object | null}
 */
export function buildLeavingDraftSessionSnapshot(leavingId, ctx = {}) {
  const tid = String(leavingId ?? '').trim()
  if (!tid) return null

  const live = ctx.live
  const gate = ctx.gate
  const liveTid = String(live?.meta?.trainingId ?? '').trim()
  const gateSnap = gate?.id === tid ? gate.snap : null

  if (liveTid === tid && String(live?.loadState ?? '') === 'ok' && String(live?.client?.id ?? '').trim()) {
    const snap = buildTrainingDraftSessionSnapshot({
      loadState: 'ok',
      meta: { status: live?.meta?.status ?? 'draft', trainingId: tid },
      workoutState: live?.workoutState,
      trainingType: live?.trainingType,
      trainingDate: live?.trainingDate,
      client: live.client,
      contra: String(gateSnap?.contra ?? ''),
      membershipSummary: gateSnap?.membershipSummary ?? null,
      otherCompletedTrainings: Number(gateSnap?.otherCompletedTrainings) || 0,
      lateBlockedNotice: String(gateSnap?.lateBlockedNotice ?? ''),
    })
    if (snap && isTrainingDraftSessionSnapshotReady(snap, tid)) return snap
  }

  if (gateSnap && isTrainingDraftSessionSnapshotReady(gateSnap, tid)) return gateSnap
  return null
}

/**
 * Синхронный flush в session LRU (до смены UI / cache hit).
 * @param {string | null | undefined} leavingId
 * @param {Parameters<typeof buildLeavingDraftSessionSnapshot>[1]} ctx
 * @returns {boolean}
 */
export function putLeavingDraftSessionOnTabSwitch(leavingId, ctx = {}) {
  const tid = String(leavingId ?? '').trim()
  if (!tid) return false
  const snap = buildLeavingDraftSessionSnapshot(tid, ctx)
  if (!snap || !isTrainingDraftSessionSnapshotReady(snap, tid)) return false
  return putTrainingDraftSession(tid, snap)
}

/**
 * Симуляция A → B → A для verify: round-trip через session LRU.
 * @param {{
 *   draftA: object,
 *   draftB: object,
 *   liveA: object,
 *   liveB: object,
 *   gateA?: object,
 *   gateB?: object,
 * }} scenario
 * @returns {{ restoredA: object | null, restoredB: object | null }}
 */
export function simulateDraftTabRoundTrip(scenario = {}) {
  const { draftA, draftB, liveA, liveB, gateA, gateB } = scenario
  putLeavingDraftSessionOnTabSwitch(draftA, { live: liveA, gate: gateA ?? { id: draftA, snap: null } })
  putLeavingDraftSessionOnTabSwitch(draftB, { live: liveB, gate: gateB ?? { id: draftB, snap: null } })
  putLeavingDraftSessionOnTabSwitch(draftA, { live: liveA, gate: gateA ?? { id: draftA, snap: null } })
  return {
    restoredA: buildLeavingDraftSessionSnapshot(draftA, { live: liveA, gate: gateA ?? { id: draftA, snap: null } }),
    restoredB: buildLeavingDraftSessionSnapshot(draftB, { live: liveB, gate: gateB ?? { id: draftB, snap: null } }),
  }
}

/**
 * @param {string | null | undefined} leavingId
 * @param {Parameters<typeof buildLeavingDraftSessionSnapshot>[1]} ctx
 * @returns {boolean}
 */
export function shouldFlushLeavingDraftOnTabSwitch(leavingId, ctx = {}) {
  const tid = String(leavingId ?? '').trim()
  if (!tid) return false
  const nextRouteId = String(ctx.nextRouteId ?? '').trim()
  if (!nextRouteId || nextRouteId === tid) return false
  return buildLeavingDraftSessionSnapshot(tid, ctx) != null
}
