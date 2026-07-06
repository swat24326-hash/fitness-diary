/** Доменные правила FIT-CITY для ЭВС «ИСКРА» (источники данных, лексикон). */

export const GEMINI_LEXICON_POOLS = {
  praise: ['стабильно', 'в норме', 'на уровне', 'без отклонений', 'выполнено', 'достаточно', 'подтверждено'],
  critique: ['отставание', 'просадка', 'риск', 'ниже плана', 'недобор', 'отклонение', 'требует внимания'],
  push: ['усилить контроль', 'сверить с менеджером', 'дожать план', 'подтянуть отчёты', 'проработать продления'],
  openers: ['Запрос обработан', 'По данным системы', 'Сводка', 'Фиксирую', 'Анализ'],
  closers: ['Готова к следующему запросу', 'Данные из snapshot', 'Контуры разделены', 'На связи'],
}

export function buildGeminiLexiconRule() {
  return [
    'Тон: строгий аналитик, без сленга и «воды».',
    `Позитив: ${GEMINI_LEXICON_POOLS.praise.slice(0, 5).join(', ')}.`,
    `Риск: ${GEMINI_LEXICON_POOLS.critique.slice(0, 5).join(', ')}.`,
    'Не повторяй одну формулировку в каждом ответе.',
  ].join(' ')
}

export function buildGeminiDataSourceRules() {
  return [
    'ДВА КОНТУРА (не смешивать): sales_contour — отчёт менеджера; trainer_contour — планшеты/FIT-CITY.',
    'sales_contour: прибыль, план (plan_fact_gross без вычета возвратов), profit_total после возвратов, матрица ПЗ/ТЗ/АЗ, finance.trainer_payroll.',
    'trainer_contour: personal_salary_month, completed_trainings, active/inactive клиенты тренера, no_type_trainings_ignored.',
    'План месяца: plan_level_1/2/3 — три порога в ₽; plan_total = plan_level_3; achieved_plan_level — закрытый порог.',
    'matrix_counts_pz_tz_az — штуки абонементов из матрицы, не рубли.',
    'insights — готовые выводы системы; НЕ пересчитывай.',
    'FIT-CITY (trainings.fit_city_tablets_only) — подмножество trainer_contour, не весь зал из отчёта.',
    'finance.trainer_payroll ≠ сумма trainer_contour.personal_salary_month — разные контуры и алгоритмы.',
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
