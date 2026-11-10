/**
 * Название клуба в шапке сотрудника: без «—» и без UUID на глазах у зала.
 */

const LOADING = '…'
const FALLBACK = 'Клуб'

/**
 * Подпись в шапке (не админ): пока грузим — «…»; пусто / «—» — «Клуб»; иначе имя.
 * @param {string | null | undefined} trainerLabel null = ещё не резолвили
 */
export function staffHeaderClubTitle(trainerLabel) {
  if (trainerLabel === null || trainerLabel === undefined) return LOADING
  const t = String(trainerLabel).trim()
  if (!t || t === '—' || t === '…') return FALLBACK
  return t
}

/**
 * Есть ли осмысленное название клуба (не заглушка).
 * @param {string | null | undefined} name
 */
export function isRealClubDisplayName(name) {
  const t = String(name ?? '').trim()
  return Boolean(t) && t !== '—' && t !== '…' && t !== FALLBACK
}
