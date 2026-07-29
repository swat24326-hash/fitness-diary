/**
 * Выбор списка типов абонементов для отчёта продаж:
 * предпочитаем более полный (новый тип АЗ не должен теряться из-за устаревшего кэша).
 */
export function pickMembershipTypesForSalesReport(bundleTypes, ensuredTypes) {
  const fromBundle = Array.isArray(bundleTypes) ? bundleTypes : []
  const fromEnsure = Array.isArray(ensuredTypes) ? ensuredTypes : []
  if (fromBundle.length >= fromEnsure.length && fromBundle.length) return fromBundle
  if (fromEnsure.length) return fromEnsure
  return fromBundle
}

/** Роли, которым разрешён GET action=membership-types */
export function canFetchMembershipTypesViaApi({ isAdmin, isTrainer, isSalesManager }) {
  return Boolean(isAdmin || isTrainer || isSalesManager)
}
