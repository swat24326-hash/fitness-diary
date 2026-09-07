/**
 * Правила проверки в конце ответа агента: что линтовать и что считать критическим путём.
 * Чистая логика — проверяется scripts/verify-hooks.mjs.
 */

const LINTABLE = /\.(js|jsx|mjs)$/i
// Совпадает с ignores в eslint.config.js: хук запускает eslint с --no-ignore,
// поэтому отсеиваем лишнее сами.
const SKIP_DIRS = /(^|[\\/])(node_modules|dist|public|\.vercel|qa-screenshots|supabase[\\/]functions)([\\/]|$)/i

/** Файлы, которые имеет смысл прогонять через eslint. */
export function filterLintable(paths) {
  return paths.filter((path) => LINTABLE.test(path) && !SKIP_DIRS.test(path))
}

/**
 * Достаёт из JSON-отчёта eslint только ошибки (severity 2).
 * Предупреждения игнорируем: в проекте они намеренно оставлены (no-unused-vars = warn).
 */
export function parseEslintErrors(stdout) {
  let report = []
  try {
    report = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(report)) return []

  return report.flatMap((file) =>
    (file?.messages || [])
      .filter((message) => message.severity === 2)
      .map(
        (message) =>
          `${file.filePath}:${message.line}:${message.column} ${message.message} (${message.ruleId || 'parse'})`
      )
  )
}

/**
 * Критический путь по fitness-diary-stability.mdc: офлайн, sync, абонементы,
 * завершение тренировки, агрегаты статистики. Правки здесь требуют verify / qa:critical.
 */
const CRITICAL = [
  [/sync|syncService|syncQueue|trainerPull|pullReference/i, 'sync и очередь'],
  [/membership|абонемент/i, 'абонементы'],
  [/Agg\.js$|periodStats|MonthlyStats|trainerPay/i, 'статистика и агрегаты'],
  [/api[\\/](push-record|push-records|trainer-pull)/i, 'API записи и pull'],
  [/pushRecordCore|authorizePush|requireAuth/i, 'запись и авторизация'],
  [/TrainingForm|trainingComplete|finishTraining/i, 'завершение тренировки'],
]

// Критический путь — это поведение, а не текст: правило `fitness-diary-sync.mdc`
// или `docs/SYNC.md` содержат слово sync, но менять поведение не могут.
const BEHAVIOUR_FILE = /\.(js|jsx|mjs|sql)$/i

/** @returns {string[]} названия затронутых критических зон */
export function criticalZones(paths) {
  const zones = new Set()
  for (const path of paths) {
    if (!BEHAVIOUR_FILE.test(path)) continue
    for (const [pattern, zone] of CRITICAL) {
      if (pattern.test(path)) zones.add(zone)
    }
  }
  return [...zones]
}
