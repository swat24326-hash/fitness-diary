/** Какие темы ИСКРА может взять из отчётов приложения, а где допустима оценка с предупреждением. */

export const ISKRA_ESTIMATE_DISCLAIMER_RU =
  'Оценка ИСКРЫ — не из отчётов приложения:'

const MONTH_FORECAST_HINTS = {
  not_current_month: 'Прогноз на конец месяца доступен только для текущего календарного месяца.',
  insufficient_reports: 'Для прогноза нужно минимум 3 дневных отчёта менеджера.',
  missing: 'Прогноз в базе приложения не сформирован.',
}

/**
 * @param {Record<string, unknown> | null | undefined} monthForecast
 */
function monthForecastHint(monthForecast) {
  const reason = String(monthForecast?.reason ?? 'missing')
  return MONTH_FORECAST_HINTS[reason] ?? MONTH_FORECAST_HINTS.missing
}

/**
 * @param {{
 *   id: string,
 *   label_ru: string,
 *   available: boolean,
 *   reason?: string | null,
 *   hint_ru?: string | null,
 * }} topic
 */
function pushTopic(topics, topic) {
  topics.push({
    id: topic.id,
    label_ru: topic.label_ru,
    available: topic.available === true,
    reason: topic.available ? null : String(topic.reason ?? 'unavailable'),
    hint_ru: topic.available ? null : String(topic.hint_ru ?? 'Данных нет в базе приложения.'),
  })
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ hasPreviousPeriod?: boolean, selectedTrainerId?: string | null }} [opts]
 */
export function buildIskraDataAvailability(snapshot, opts = {}) {
  const sales = snapshot?.sales ?? {}
  const insights = snapshot?.insights ?? {}
  const finance = snapshot?.finance
  const monthForecast = snapshot?.month_forecast
  const clubFinance = snapshot?.club_finance
  const trainerContour = snapshot?.trainer_contour
  const selectedTrainerId = String(opts.selectedTrainerId ?? trainerContour?.selected_trainer_id ?? '').trim()
  const reportDays = Number(sales.days_with_reports) || 0

  /** @type {Array<{ id: string, label_ru: string, available: boolean, reason: string | null, hint_ru: string | null }>} */
  const topics = []

  const planTotal = Number(sales.plan_total) || Number(sales.plan_level_3) || 0
  pushTopic(topics, {
    id: 'sales_plan',
    label_ru: 'план продаж',
    available: planTotal > 0,
    reason: 'plan_not_set',
    hint_ru: 'План уровня 3 на месяц не задан — в отчётах нет цели для сравнения.',
  })

  pushTopic(topics, {
    id: 'month_forecast',
    label_ru: 'прогноз на конец месяца',
    available: monthForecast?.available === true || clubFinance?.available === true,
    reason: String(monthForecast?.reason ?? clubFinance?.reason ?? 'missing'),
    hint_ru: monthForecastHint(monthForecast ?? clubFinance),
  })

  pushTopic(topics, {
    id: 'club_finance',
    label_ru: 'финансы клуба (прогноз и залы)',
    available: clubFinance?.available === true,
    reason: String(clubFinance?.reason ?? 'missing'),
    hint_ru: monthForecastHint(clubFinance),
  })

  pushTopic(topics, {
    id: 'finance',
    label_ru: 'финансы (ЗП залов, чистая прибыль)',
    available: finance != null && typeof finance === 'object',
    reason: 'finance_not_in_snapshot',
    hint_ru: 'Блок финансов не передан — чистая прибыль и ЗП из приложения недоступны.',
  })

  pushTopic(topics, {
    id: 'mom_comparison',
    label_ru: 'сравнение с прошлым месяцем',
    available: opts.hasPreviousPeriod === true && insights.mom_comparison != null,
    reason: 'no_previous_period',
    hint_ru: 'Прошлый месяц не подгружен — сравнение только по запросу с данными за оба периода.',
  })

  pushTopic(topics, {
    id: 'direction_plan',
    label_ru: 'план по направлениям ПЗ/ТЗ/АЗ',
    available: insights.direction_plan?.has_direction_plans === true,
    reason: 'direction_plans_not_set',
    hint_ru: 'План по направлениям не задан в настройках месяца.',
  })

  pushTopic(topics, {
    id: 'trainer_contour',
    label_ru: 'данные тренера с планшетов',
    available: selectedTrainerId
      ? (trainerContour?.trainers ?? []).some((t) => String(t.trainer_id) === selectedTrainerId)
      : (trainerContour?.trainers ?? []).length > 0,
    reason: selectedTrainerId ? 'trainer_not_found' : 'no_trainer_contour',
    hint_ru: selectedTrainerId
      ? 'Выбранный тренер не найден в контуре планшетов за период.'
      : 'Контур тренеров пуст — нет данных FIT-CITY за период.',
  })

  pushTopic(topics, {
    id: 'report_coverage',
    label_ru: 'отчёт за сегодня внесён',
    available: reportDays > 0,
    reason: 'no_reports_yet',
    hint_ru: 'Дневных отчётов в месяце пока нет — сводка появится после первого внесения.',
  })

  const unavailable = topics.filter((t) => !t.available)

  return {
    policy: 'app_data_first_then_disclosed_estimate',
    estimate_allowed: true,
    estimate_disclaimer_ru: ISKRA_ESTIMATE_DISCLAIMER_RU,
    topics,
    unavailable_topic_ids: unavailable.map((t) => t.id),
    unavailable_labels_ru: unavailable.map((t) => t.label_ru),
  }
}

/**
 * @param {ReturnType<typeof buildIskraDataAvailability> | null | undefined} availability
 * @param {string} topicId
 */
export function isIskraTopicAvailable(availability, topicId) {
  const hit = availability?.topics?.find((t) => t.id === topicId)
  return hit?.available === true
}

/**
 * @param {ReturnType<typeof buildIskraDataAvailability> | null | undefined} availability
 * @param {string} topicId
 */
export function iskraUnavailableHint(availability, topicId) {
  const hit = availability?.topics?.find((t) => t.id === topicId)
  return hit?.hint_ru ?? 'Данных нет в базе приложения.'
}

/**
 * Мета-правило: ОС не идеал мира — проси данные / направление развития.
 */
export function buildProductGapAskRule() {
  return [
    'ПРОБЕЛЫ ДАННЫХ И ПРОДУКТА (мета):',
    'FIT-CITY — рабочая ОС клуба, не идеал мира. ИСКРА может честно сказать, где потолок данных или продукта.',
    'Если data_availability.topics: available:false по теме вопроса:',
    '1) Скажи простым языком, чего не хватает (ориентир — hint_ru).',
    '2) В конце — ОДНА конкретная просьба: какое действие/данные в приложении улучшат ответ',
    '   (например: «задайте план L3», «нужно ≥3 дневных отчёта менеджера», «откройте сравнение с прошлым месяцем»).',
    '3) Если потолок системный — одна короткая идея, куда развивать продукт или ИСКРУ, без воды и без «перепишите всё».',
    'Не повторяй этот блок в каждом ответе — только когда тема упирается в пробел.',
  ].join('\n')
}
