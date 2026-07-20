/**
 * Честный потолок модели: насколько можно доверять совету при дырах в данных.
 */

/**
 * @param {ReturnType<import('./iskraDataAvailability.js').buildIskraDataAvailability> | null | undefined} availability
 * @param {{ confidence?: string | null } | null} [forecastConfidence]
 * @returns {{
 *   score: number,
 *   band: 'high' | 'medium' | 'low',
 *   label_ru: string,
 *   missing: string[],
 *   ask_ru: string | null,
 * }}
 */
export function estimateIskraModelCeiling(availability, forecastConfidence = null) {
  const topics = availability?.topics ?? []
  const missing = topics.filter((t) => !t.available).map((t) => t.label_ru || t.id)
  const total = topics.length || 1
  const availableCount = topics.filter((t) => t.available).length
  let score = Math.round((availableCount / total) * 100)

  const conf = String(forecastConfidence?.confidence ?? '').toLowerCase()
  if (conf === 'low') score = Math.min(score, 45)
  else if (conf === 'medium') score = Math.min(score, 70)
  else if (conf === 'high') score = Math.max(score, score)

  if (missing.some((m) => /план/i.test(m))) score = Math.min(score, 55)
  if (missing.some((m) => /прогноз/i.test(m))) score = Math.min(score, 60)

  /** @type {'high' | 'medium' | 'low'} */
  let band = 'high'
  if (score < 50) band = 'low'
  else if (score < 75) band = 'medium'

  const label_ru =
    band === 'high'
      ? `Надёжность ответа ≈ ${score}% — данных достаточно`
      : band === 'medium'
        ? `Надёжность ответа ≈ ${score}% — есть пробелы`
        : `Надёжность ответа ≈ ${score}% — совет ориентировочный`

  const firstMissing = missing[0] ?? null
  const ask_ru = firstMissing
    ? `Если дадите «${firstMissing}», оценка станет заметно точнее.`
    : band === 'low'
      ? 'Нужны дневные отчёты и план L3 — иначе потолок модели низкий.'
      : null

  return { score, band, label_ru, missing: missing.slice(0, 5), ask_ru }
}

/**
 * @param {ReturnType<typeof estimateIskraModelCeiling>} ceiling
 */
export function buildModelCeilingPromptRule(ceiling) {
  if (!ceiling) return ''
  return [
    'ЧЕСТНЫЙ ПОТОЛОК МОДЕЛИ:',
    `${ceiling.label_ru}.`,
    ceiling.missing.length
      ? `Не хватает в приложении: ${ceiling.missing.join(', ')}.`
      : 'Критичных дыр в data_availability нет.',
    ceiling.ask_ru ? `Одна просьба: ${ceiling.ask_ru}` : '',
    'Не притворяйся, что цифр достаточно. Если band=low — начни с оговорки про неполноту данных.',
    'Можно коротко сказать, какой следующий кусок продукта поднимет потолок (без «перепишите всё»).',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Расширение мета-правила пробелов.
 */
export function buildProductGapAskRuleWithCeiling() {
  return [
    'ПРОБЕЛЫ ДАННЫХ И ПРОДУКТА (мета):',
    'FIT-CITY — рабочая ОС клуба, не идеал мира.',
    'Смотри data_availability и model_ceiling (если есть): available:false → сначала честно скажи, чего нет.',
    'Назови ориентир надёжности («примерно N%»), если model_ceiling.score задан.',
    'В конце — ОДНА просьба: какие данные улучшат ответ.',
    'Если потолок системный — одна идея развития продукта/ИСКРЫ.',
  ].join('\n')
}
