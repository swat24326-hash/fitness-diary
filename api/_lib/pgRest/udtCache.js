export const UDT_RELOAD_MIN_MS = 5000

/** Поля, которые запрос пишет: их тип нужен для привязки (jsonb, uuid…). */
export function specWriteColumns(spec) {
  const cols = new Set()
  const rows = Array.isArray(spec?.payload) ? spec.payload : spec?.payload ? [spec.payload] : []
  for (const row of rows) {
    if (row && typeof row === 'object') for (const key of Object.keys(row)) cols.add(key)
  }
  return [...cols]
}

/**
 * Кэш типов читается при старте процесса; миграция после рестарта добавляет таблицы/колонки,
 * о которых он не знает — без типа jsonb драйвер пишет [] как '{}' (объект).
 * @param {Map<string, string>} typesByKey
 */
export function needsUdtReload(typesByKey, table, columns, lastLoadMs, nowMs) {
  if (nowMs - lastLoadMs < UDT_RELOAD_MIN_MS) return false
  return columns.some((col) => !typesByKey.has(`${table}.${col}`))
}
