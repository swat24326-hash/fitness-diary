/** Доменные правила FIT-CITY для промпта Василия (источники данных, лексикон). */

export const GEMINI_LEXICON_POOLS = {
  praise: ['красава', 'огонь', 'топ', 'мощно', 'чётко', 'жёстко', 'красота', 'в точку', 'респект'],
  critique: ['косяк', 'просели', 'дыра', 'слабовато', 'западаем', 'просадка', 'не догоняем', 'мимо плана'],
  push: ['поднажать', 'дожать', 'разогнать', 'подтянуть', 'добить план', 'не расслабляться'],
  openers: ['смотри', 'короче', 'по факту', 'картина такая', 'если по цифрам', 'главное'],
  closers: ['на связи', 'если что — спроси', 'разберём', 'погнали дальше'],
}

export function buildGeminiLexiconRule() {
  return [
    'Чередуй обороты — не повторяй одно слово в каждом ответе.',
    `Хвалить: ${GEMINI_LEXICON_POOLS.praise.slice(0, 6).join(', ')}.`,
    `Критика: ${GEMINI_LEXICON_POOLS.critique.slice(0, 6).join(', ')}.`,
    `Призыв: ${GEMINI_LEXICON_POOLS.push.slice(0, 5).join(', ')}.`,
    'Звучи как живой старший, не как шаблон.',
  ].join(' ')
}

export function buildGeminiDataSourceRules() {
  return [
    'ИСТОЧНИК ИСТИНЫ ПО ЗАЛУ — ежедневный отчёт менеджера (sales.*, trainings.manager_report_total): прибыль НК/ДК/УК, ПНК, план, тренировки клуба целиком.',
    'План месяца: plan_level_1/2/3 — три порога в ₽ (не суммируются); plan_total = plan_level_3 (финал); achieved_plan_level = какой порог уже закрыт фактом.',
    'plan_direction_rub (ПЗ/ТЗ/АЗ) — план по направлениям в ₽, сумма = plan_level_3. matrix_counts_pz_tz_az — количества из матрицы 3×3 (шт), не путай с рублями.',
    'profit_day_highlights — лучший/худший день среди дней с отчётом; полной дневной серии в JSON нет — не выдумывай другие дни.',
    'trainings_by_card_type — тренировки по типам абонементов из отчёта менеджера (не FIT-CITY).',
    'FIT-CITY (trainings.fit_city_tablets_only) — только завершённые тренировки тренеров С ПЛАНШЕТОМ. Это подмножество зала, НЕ полный клуб.',
    'Тренер без планшета в FIT-CITY не виден, но в отчёте менеджера его тренировки учтены — не путай «систему» и «весь зал».',
    'Если manager_report_total > fit_city_tablets_only — часто норма (нет планшета / отчёт полнее). Большой gap — мягко: сверить с менеджером, кто без планшета, догнать отчёты.',
    'План и прибыль — только из отчёта менеджера. days_with_reports / days_in_month — насколько забита база.',
    'Сравнивая FIT-CITY и отчёт — говори «расхождение», «справка по планшетам», не «в системе столько же должно быть».',
  ].join('\n')
}

/**
 * @param {number} managerTotal
 * @param {number} fitCityTotal
 * @param {number} dayCount
 * @param {number} daysInMonth
 */
export function buildTrainingsGapHint(managerTotal, fitCityTotal, dayCount, daysInMonth) {
  const gap = managerTotal - fitCityTotal
  const hints = []
  if (dayCount < Math.max(3, Math.floor(daysInMonth * 0.3))) {
    hints.push('Мало дней с отчётом менеджера — выводы по месяцу предварительные.')
  }
  if (gap > 0 && fitCityTotal > 0) {
    hints.push(
      `В отчёте менеджера тренировок на ${gap} больше, чем в FIT-CITY — вероятно часть зала без планшета или отчёт шире системы.`,
    )
  } else if (gap > 0 && fitCityTotal === 0 && managerTotal > 0) {
    hints.push('FIT-CITY пустой или почти пустой при данных в отчёте — планшеты не покрывают зал.')
  } else if (gap < 0) {
    hints.push(
      'FIT-CITY больше отчёта менеджера — проверить, догнали ли дневные отчёты продаж.',
    )
  }
  return hints
}

/**
 * Метаданные для JSON snapshot — чтобы модель не путала источники.
 * @param {{
 *   managerReportTotal: number,
 *   fitCityTotal: number,
 *   dayCount: number,
 *   daysInMonth: number,
 * }} opts
 */
export function buildGeminiDataSourcesMeta(opts) {
  const managerReportTotal = Number(opts.managerReportTotal) || 0
  const fitCityTotal = Number(opts.fitCityTotal) || 0
  const dayCount = Number(opts.dayCount) || 0
  const daysInMonth = Number(opts.daysInMonth) || 0
  const coveragePct =
    daysInMonth > 0 ? Math.round((dayCount / daysInMonth) * 1000) / 10 : 0

  return {
    authoritative: {
      source: 'manager_daily_sales_report',
      description: 'Официальный отчёт менеджера по клубу — прибыль, ПНК, план, матрица, тренировки всего зала',
      fields: [
        'sales.profit_*',
        'sales.pnk_total',
        'sales.plan_*',
        'sales.matrix_counts_pz_tz_az',
        'sales.profit_day_highlights',
        'sales.trainings_by_card_type',
        'trainings.manager_report_total',
      ],
    },
    reference_partial: {
      source: 'fit_city_app_tablets',
      description: 'Завершённые тренировки только у тренеров с планшетом — не весь клуб',
      fields: ['trainings.fit_city_tablets_only'],
    },
    report_coverage_pct: coveragePct,
    analysis_hints: buildTrainingsGapHint(managerReportTotal, fitCityTotal, dayCount, daysInMonth),
  }
}
