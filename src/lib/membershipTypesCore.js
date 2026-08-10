/** Чистые правила типов абонементов (без IDB / Supabase). */

/** Макс. длина названия типа карты (ПЗ/АЗ), символов. */
export const MEMBERSHIP_TYPE_CODE_MAX_LEN = 40

/** @param {unknown} raw */
export function normalizeMembershipTypeCode(raw) {
  return String(raw ?? '')
    .trim()
    .slice(0, MEMBERSHIP_TYPE_CODE_MAX_LEN)
}

/** @param {object | null | undefined} t */
export function isTrainerAssignableMembershipType(t) {
  return t?.trainer_assignable !== false
}

/** @param {object | null | undefined} t */
export function isAerobicSalesMembershipType(t) {
  return t?.trainer_assignable === false
}

/** Пробный БЗ / ПНК — неплатный, не ДК */
export function isPnkTrialMembershipType(t) {
  return t?.is_pnk_trial === true
}

/** @param {object[]} [types] */
export function filterTrainerAssignableTypes(types) {
  return (types ?? []).filter(isTrainerAssignableMembershipType)
}

/** @param {object[]} [types] */
export function filterAerobicSalesTypes(types) {
  return (types ?? []).filter(isAerobicSalesMembershipType)
}

/**
 * Поиск дубликата code в клубе (без учёта регистра), опционально исключая id.
 * @param {Array<{ id?: string, code?: string }>} [types]
 * @param {unknown} code
 * @param {{ excludeId?: string }} [opts]
 */
export function findMembershipTypeByCode(types, code, opts = {}) {
  const key = normalizeMembershipTypeCode(code).toLowerCase()
  if (!key) return null
  const exclude = String(opts.excludeId ?? '').trim()
  for (const t of types ?? []) {
    if (exclude && String(t?.id ?? '').trim() === exclude) continue
    if (normalizeMembershipTypeCode(t?.code).toLowerCase() === key) return t
  }
  return null
}

/**
 * Проверка нового названия типа карты (добавление или переименование).
 * Абонементы ссылаются на id типа — смена code не отвязывает уже выданные карты.
 *
 * @param {{
 *   nextCode?: unknown,
 *   previousCode?: unknown,
 *   existingTypes?: Array<{ id?: string, code?: string, is_active?: boolean }>,
 *   excludeId?: string,
 * }} input
 * @returns {{ ok: true, code: string, unchanged?: boolean } | { ok: false, error: string }}
 */
export function validateMembershipTypeCodeChange(input) {
  const code = normalizeMembershipTypeCode(input?.nextCode)
  if (!code) {
    return { ok: false, error: 'Введите короткое название типа' }
  }

  const prev = normalizeMembershipTypeCode(input?.previousCode)
  if (prev && code === prev) {
    return { ok: true, code, unchanged: true }
  }

  const dup = findMembershipTypeByCode(input?.existingTypes, code, {
    excludeId: input?.excludeId,
  })
  if (dup) {
    const shown = normalizeMembershipTypeCode(dup.code) || code
    if (dup.is_active === false) {
      return { ok: false, error: `Тип «${shown}» уже был — он отключён.` }
    }
    return { ok: false, error: `Тип «${shown}» уже в списке.` }
  }

  return { ok: true, code }
}
