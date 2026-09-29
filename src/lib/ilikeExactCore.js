/**
 * Значение для `.ilike()` как точное сравнение без учёта регистра.
 * `%` и `_` в LIKE — шаблоны, `*` PostgREST превращает в `%`: без этого
 * `a_min@x` совпадает с `admin@x` (подбор чужого профиля по email).
 * @param {unknown} value
 * @returns {string | null} null — искать нельзя (пусто или `*`), считать «не найдено».
 */
export function ilikeExactPattern(value) {
  const s = String(value ?? '').trim()
  if (!s || s.includes('*')) return null
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}
