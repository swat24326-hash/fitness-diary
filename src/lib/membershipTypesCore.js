/** Чистые правила типов абонементов (без IDB / Supabase). */

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
