/**
 * Смена тренера ПЗ на карточке клиента (чистая логика).
 * Один вход: поле «Тренер ПЗ» + Сохранить — без отдельного модала в списке.
 */

/**
 * @param {object|null|undefined} trainer
 * @returns {boolean|null} true = с планшетом, false = lite, null = неизвестно
 */
export function trainerTabletMode(trainer) {
  if (!trainer || trainer.uses_tablet == null) return null
  return trainer.uses_tablet !== false
}

/**
 * Текст confirm при смене режима планшет ↔ без планшета.
 * @param {{ fromTrainer?: object|null, toTrainer?: object|null }} opts
 * @returns {string|null}
 */
export function tabletModeChangeConfirmMessage({ fromTrainer, toTrainer } = {}) {
  const fromMode = trainerTabletMode(fromTrainer)
  const toMode = trainerTabletMode(toTrainer)
  if (fromMode == null || toMode == null) return null
  if (fromMode === toMode) return null
  if (!toMode) {
    return 'Новый тренер без планшета: карточку будет вести админ (карта и абон), не полный дневник. Продолжить?'
  }
  return 'Новый тренер с планшетом: карточка станет полным дневником. Продолжить?'
}

/**
 * club_id клиента после назначения тренера.
 * @param {{ clientClubId?: string|null, trainerRow?: object|null }} opts
 * @returns {string|null}
 */
export function resolveClientClubIdForTrainer({ clientClubId, trainerRow } = {}) {
  const fromTrainer = String(trainerRow?.club_id ?? '').trim()
  if (fromTrainer) return fromTrainer
  const prev = String(clientClubId ?? '').trim()
  return prev || null
}

/**
 * № карты для проверки уникальности при переезде: сначала форма, иначе карточка.
 * @param {{ proposedCardNumber?: string|null, clientCardNumber?: string|null }} opts
 * @returns {string}
 */
export function resolveCardNumberForClubMoveCheck({ proposedCardNumber, clientCardNumber } = {}) {
  if (proposedCardNumber !== undefined && proposedCardNumber !== null) {
    return String(proposedCardNumber).trim()
  }
  return String(clientCardNumber ?? '').trim()
}

/**
 * Нужна ли проверка уникальности карты при смене клуба.
 * @param {{ oldClubId?: string|null, newClubId?: string|null, cardNumber?: string|null }} opts
 */
export function needsCardUniquenessCheckOnClubMove({ oldClubId, newClubId, cardNumber } = {}) {
  const card = String(cardNumber ?? '').trim()
  const oldC = String(oldClubId ?? '').trim()
  const newC = String(newClubId ?? '').trim()
  return Boolean(card && newC && newC !== oldC)
}

/**
 * Confirm при переезде в клуб нового тренера.
 * @param {{ oldClubId?: string|null, newClubId?: string|null, trainerName?: string }} opts
 * @returns {string|null}
 */
export function clubMoveConfirmMessage({ oldClubId, newClubId, trainerName } = {}) {
  const oldC = String(oldClubId ?? '').trim()
  const newC = String(newClubId ?? '').trim()
  if (!newC || newC === oldC) return null
  const who = String(trainerName ?? '').trim()
  return who
    ? `Тренер «${who}» из другого клуба. Клиент переедет в клуб этого тренера. Продолжить?`
    : 'Тренер из другого клуба. Клиент переедет в клуб этого тренера. Продолжить?'
}

/**
 * Патчи абонов/тренировок при переезде клиента в другой клуб.
 * @param {{
 *   memberships?: object[],
 *   trainings?: object[],
 *   oldClubId?: string|null,
 *   nextClubId?: string|null,
 * }} opts
 * @returns {{ memberships: object[], trainings: object[] }}
 */
export function planClientClubMoveRelatedPatches({
  memberships = [],
  trainings = [],
  oldClubId,
  nextClubId,
} = {}) {
  const next = String(nextClubId ?? '').trim() || null
  const old = String(oldClubId ?? '').trim() || null
  if (!next || next === old) return { memberships: [], trainings: [] }
  const memOut = []
  for (const m of memberships ?? []) {
    if (!m?.id) continue
    if (String(m.club_id ?? '').trim() === next) continue
    memOut.push({ ...m, club_id: next })
  }
  const trOut = []
  for (const t of trainings ?? []) {
    if (!t?.id) continue
    if (String(t.club_id ?? '').trim() === next) continue
    trOut.push({ ...t, club_id: next })
  }
  return { memberships: memOut, trainings: trOut }
}

/**
 * Подпись тренера в select (с клубом, если список сети).
 * @param {object|null|undefined} trainer
 * @param {{ showClub?: boolean, clubNameById?: Record<string, string> }} [opts]
 */
export function formatTrainerSelectLabel(trainer, opts = {}) {
  if (!trainer?.id) return ''
  const name = String(trainer.name || trainer.login || trainer.id).trim()
  if (!opts.showClub) return name
  const cid = String(trainer.club_id ?? '').trim()
  if (!cid) return name
  const mapped = opts.clubNameById?.[cid]
  const clubLabel = mapped ? String(mapped).trim() : ''
  return `${name} · ${clubLabel || `клуб ${cid.slice(0, 8)}…`}`
}
