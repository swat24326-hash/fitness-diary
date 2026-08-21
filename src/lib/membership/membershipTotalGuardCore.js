/**
 * Защита лимита абонемента: total не меньше уже списанных; confirm на подозрительно малый лимит.
 * Без React/IDB — verify + UI (MembershipManager, desk АЗ, sale clip).
 */

/** Платные карты: 1…N занятий — частая опечатка вместо 8/12 (БЗ исключаем отдельно). */
export const SUSPICIOUS_PAID_TOTAL_MAX = 3

/**
 * Эффективно использовано: max(поле used_trainings, дневник).
 * @param {unknown} usedStored
 * @param {unknown} usedDiary
 */
export function resolveEffectiveMembershipUsed(usedStored, usedDiary) {
  const stored = Number(usedStored ?? 0)
  const diary = Number(usedDiary ?? 0)
  const a = Number.isFinite(stored) && stored > 0 ? Math.trunc(stored) : 0
  const b = Number.isFinite(diary) && diary > 0 ? Math.trunc(diary) : 0
  return Math.max(a, b)
}

/**
 * Нормализация лимита занятий для записи (целое ≥ 0).
 * @param {unknown} raw
 */
export function normalizeMembershipTotalTrainings(raw) {
  const n = Number(raw ?? 0)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

/**
 * Пакет с лимитом занятий, у которого used > total (опечатка total / урезание ниже факта).
 * total ≤ 0 (ТЗ / безлимит) — не «битый».
 * @param {{ totalTrainings?: unknown, usedEffective?: unknown }} p
 */
export function isMembershipTotalBroken(p) {
  const total = Number(p?.totalTrainings ?? 0)
  const used = Number(p?.usedEffective ?? 0)
  if (!Number.isFinite(total) || total <= 0) return false
  if (!Number.isFinite(used) || used < 0) return false
  return used > Math.trunc(total)
}

/** Подпись для уже существующих битых (не чиним массово — правят по ходу). */
export function membershipBrokenTotalHintRu() {
  return 'лимит меньше списанных'
}

/**
 * Сохранение create/edit: нельзя total > 0 и total < уже списанного.
 * @param {{
 *   totalTrainings?: unknown,
 *   usedStored?: unknown,
 *   usedDiary?: unknown,
 * }} p
 * @returns {{ ok: true, total: number } | { ok: false, error: string, usedEffective: number, total: number }}
 */
export function validateMembershipTotalAgainstUsed(p) {
  const total = normalizeMembershipTotalTrainings(p?.totalTrainings)
  if (!(total > 0)) return { ok: true, total }

  const usedEffective = resolveEffectiveMembershipUsed(p?.usedStored, p?.usedDiary)
  if (total >= usedEffective) return { ok: true, total }

  return {
    ok: false,
    usedEffective,
    total,
    error: `Уже списано ${usedEffective} — лимит занятий не может быть меньше ${usedEffective}.`,
  }
}

/**
 * Подозрительно малый лимит у платной карты (не БЗ): 1…SUSPICIOUS_PAID_TOTAL_MAX.
 * @param {{ totalTrainings?: unknown, isPnkTrialType?: boolean }} p
 */
export function shouldConfirmSuspiciousLowTotal(p) {
  if (p?.isPnkTrialType) return false
  const total = normalizeMembershipTotalTrainings(p?.totalTrainings)
  return total >= 1 && total <= SUSPICIOUS_PAID_TOTAL_MAX
}

/** @deprecated alias → shouldConfirmSuspiciousLowTotal (раньше только total===1) */
export function shouldConfirmSuspiciousTotalOne(p) {
  return shouldConfirmSuspiciousLowTotal(p)
}

/**
 * Текст confirm при подозрительно малом total.
 * @param {{ typeCode?: string, totalTrainings?: unknown }} [p]
 */
export function suspiciousLowTotalConfirmMessageRu(p = {}) {
  const total = normalizeMembershipTotalTrainings(p?.totalTrainings)
  const code = String(p?.typeCode ?? '').trim()
  const typePart = code ? `«${code}»` : 'платного типа'
  const n = total > 0 ? total : 1
  const word =
    n === 1 ? 'занятие' : n >= 2 && n <= 4 ? 'занятия' : 'занятий'
  return (
    `У абонемента ${typePart} указано всего ${n} ${word}.\n\n` +
    `Обычно у платных карт больше (например 8 или 12). Сохранить с лимитом ${n}?`
  )
}

/** @deprecated alias */
export function suspiciousTotalOneConfirmMessageRu(p = {}) {
  return suspiciousLowTotalConfirmMessageRu({ ...p, totalTrainings: p?.totalTrainings ?? 1 })
}
