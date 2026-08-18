/**
 * Архив и переезд клуба: когда писать ledger, тексты предупреждений.
 * Без React / fetch / IDB.
 */

/**
 * @param {object|null|undefined} before
 * @param {object|null|undefined} payload
 */
export function mergeClientAfterPush(before, payload) {
  const src = payload && typeof payload === 'object' ? payload : {}
  const prev = before && typeof before === 'object' ? before : {}
  return {
    id: src.id ?? prev.id ?? null,
    club_id: src.club_id !== undefined ? src.club_id : prev.club_id,
    trainer_id: src.trainer_id !== undefined ? src.trainer_id : prev.trainer_id,
    archived_at: src.archived_at !== undefined ? src.archived_at : prev.archived_at,
  }
}

function hasTs(v) {
  if (v == null || v === '') return false
  return true
}

/**
 * archived_at стал не null → burn_archive.
 * @param {{ before?: object|null, after?: object|null }} p
 */
export function detectLoyaltyArchiveBurn(p = {}) {
  const after = p.after ?? {}
  const before = p.before ?? null
  const was = hasTs(before?.archived_at)
  const now = hasTs(after?.archived_at)
  if (!now || was) return { write: false }
  const clientId = String(after.id ?? before?.id ?? '').trim()
  const clubId = String(after.club_id ?? before?.club_id ?? '').trim()
  if (!clientId || !clubId) return { write: false }
  return {
    write: true,
    clientId,
    clubId,
    at: after.archived_at,
  }
}

/**
 * Смена club_id → club_move на новом и left на старом.
 * Смена тренера без клуба — нет.
 * @param {{ before?: object|null, after?: object|null, asOf?: string, nowIso?: string }} p
 */
export function detectLoyaltyClubMove(p = {}) {
  const after = p.after ?? {}
  const before = p.before ?? null
  const from = String(before?.club_id ?? '').trim()
  const to = String(after.club_id ?? '').trim()
  if (!from || !to || from === to) return { write: false }
  const clientId = String(after.id ?? before?.id ?? '').trim()
  if (!clientId) return { write: false }
  const asOf = String(p.asOf ?? '').slice(0, 10)
  const at = String(p.nowIso ?? '')
  return {
    write: true,
    clientId,
    from,
    to,
    asOf,
    at,
  }
}

/**
 * @param {{ known?: boolean, points?: unknown }} p
 * @returns {string}
 */
export function loyaltyArchiveWarnText(p = {}) {
  if (p.known !== true) {
    return 'Баллы лояльности сгорят, если были. Цифру сейчас загрузить не удалось.'
  }
  const n = Number(p.points)
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  if (v <= 0) return 'Баллов лояльности сейчас нет. После возврата из архива копилка не восстановится.'
  return `Сгорят ${v} баллов. После возврата из архива копилка не восстановится.`
}

/**
 * @param {{ known?: boolean, points?: unknown }} p
 * @returns {string}
 */
export function loyaltyClubMoveWarnText(p = {}) {
  if (p.known !== true) {
    return 'Баллы лояльности в старом клубе сгорят (цифру сейчас загрузить не удалось).'
  }
  const n = Number(p.points)
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  if (v <= 0) return 'Баллов лояльности в старом клубе нет — в новом клубе цикл начнётся с нуля.'
  return `Сгорят ${v} баллов лояльности в старом клубе.`
}

/**
 * Restore не удаляет burn_archive.
 * @param {object[]} ledger
 */
export function loyaltyBurnSurvivesRestore(ledger) {
  return (ledger ?? []).some((e) => String(e?.kind ?? '') === 'burn_archive')
}
