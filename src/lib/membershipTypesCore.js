/** Чистые правила типов абонементов (без IDB / Supabase). */

/** @param {object | null | undefined} t */
export function isTrainerAssignableMembershipType(t) {
  return t?.trainer_assignable !== false
}

/** @param {object | null | undefined} t */
export function isAerobicSalesMembershipType(t) {
  return t?.trainer_assignable === false
}

/** @param {object[]} [types] */
export function filterTrainerAssignableTypes(types) {
  return (types ?? []).filter(isTrainerAssignableMembershipType)
}

/** @param {object[]} [types] */
export function filterAerobicSalesTypes(types) {
  return (types ?? []).filter(isAerobicSalesMembershipType)
}
