/**
 * Клубный флаг дневника калорий (аналог FatSecret внутри Ядра).
 * Default off — пилот без раскатки на всю сеть.
 */

export const FOOD_DIARY_ROUTE = '/me/food-diary'

export const FOOD_DIARY_CLUB_LABEL = 'Дневник калорий (клиент)'

/** @param {unknown} value */
export function isFoodDiaryEnabled(value) {
  return value === true
}

/** Флаг из строки клуба (Supabase / IDB / client-me). */
export function clubFoodDiaryEnabled(club) {
  return isFoodDiaryEnabled(club?.food_diary_enabled)
}

/**
 * Публичный кусок `club` для /api/client-me (whitelist).
 * @param {{ name?: unknown, food_diary_enabled?: unknown } | null | undefined} row
 * @param {string | null | undefined} manifestUrl
 */
export function publicClubFoodDiaryFields(row, manifestUrl) {
  return {
    food_diary_enabled: clubFoodDiaryEnabled(row),
    ...(manifestUrl != null ? { manifest_url: manifestUrl } : {}),
  }
}

/**
 * Патч строки клуба при вкл/выкл (остальные поля не трогаем).
 * @param {Record<string, unknown>} club
 * @param {boolean} enabled
 */
export function patchClubFoodDiary(club, enabled) {
  return { ...club, food_diary_enabled: enabled === true }
}

/** Подпись для списка клубов в админке. */
export function foodDiaryClubStatusRu(enabled) {
  return enabled ? 'дневник калорий вкл' : 'дневник калорий выкл'
}
