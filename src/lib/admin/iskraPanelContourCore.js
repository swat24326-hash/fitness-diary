/**
 * Жёсткие границы контуров панели ИСКРЫ (продажи / тренеры).
 * Чистые функции — scripts/verify-iskra-panel-contour.mjs
 */

/** @typedef {'sales'|'trainer'} IskraPanelSegment */

const ADVICE_QUESTION_RE =
  /совет|что делать|как дожать|рекоменд|план действ|стратег|помоги|что предпринять|куда бить|на чём сфокус|что не так|где теряем/i

const DIRECTION_FACT_RE =
  /какое направлен|какое направ|просел|отста[её]т|пз|тз|аз|нк|дк|ук|направлен/i

const PAYROLL_ALL_RE = /зп\s+тренер|зарплат.*тренер|тренер.*зарплат|фонд\s+тренер|всем\s+тренер/i

/**
 * @param {string} [message]
 */
export function isIskraAdviceQuestion(message) {
  return ADVICE_QUESTION_RE.test(String(message ?? ''))
}

/**
 * @param {string} [message]
 */
export function isDirectionDiagnosticsQuestion(message) {
  return DIRECTION_FACT_RE.test(String(message ?? ''))
}

/**
 * @param {{ segment?: string, trainerId?: string | null, userMessage?: string }} opts
 */
export function resolvePanelAnalysisFocus(opts = {}) {
  const segment = String(opts.segment ?? 'sales').trim() === 'trainer' ? 'trainer' : 'sales'
  const trainerId = String(opts.trainerId ?? '').trim()
  if (segment === 'trainer') return trainerId ? 'trainer' : 'trainer_club'
  return 'sales'
}

/**
 * @param {IskraPanelSegment} segment
 * @param {string | null | undefined} trainerId
 */
export function buildPayrollContourRule(segment, trainerId = null) {
  const sid = String(trainerId ?? '').trim()
  if (segment === 'trainer') {
    return sid
      ? 'ЗП этого тренера — только personal_salary_month (планшеты). Не подставляй finance.trainer_payroll из отчёта менеджера.'
      : 'ЗП всех тренеров в сегменте «Тренеры» — сумма personal_salary_month по планшетам. Не finance.trainer_payroll.'
  }
  return 'ЗП тренеров зала в сегменте «Продажи» — finance.trainer_payroll из отчёта менеджера. Личные ЗП планшетов здесь не использовать.'
}

/**
 * @param {IskraPanelSegment} segment
 */
export function buildPanelSegmentRule(segment) {
  if (segment === 'trainer') {
    return [
      'СЕГМЕНТ ПАНЕЛИ: Тренеры (планшеты).',
      'Только trainer_contour: тренировки completed, personal_salary_month, активные/неактивные клиенты тренера.',
      'Не используй план продаж, НК/ДК/УК, finance.trainer_payroll, club_finance, direction_plan из отчёта менеджера.',
      'Не сравнивай планшет с отчётом менеджера, пока руководитель явно не попросил сверку.',
    ].join('\n')
  }
  return [
    'СЕГМЕНТ ПАНЕЛИ: Продажи (отчёт менеджера, ежедневно).',
    'Все деньги, план, НК/ДК/УК, ПЗ/ТЗ/АЗ, finance.trainer_payroll — только sales_contour и insights.',
    'ПЗ для анализа нагрузки — pz_trainings_from_manager_reports, не completed_trainings планшетов.',
    'Неактивные клиенты — можно упоминать как риск для продаж (сигнал sales_inactive_signal), без детализации планшетов.',
    'Личную ЗП тренера (personal_salary_month) не подставляй — для этого сегмент «Тренеры».',
  ].join('\n')
}

/**
 * @param {string} [message]
 * @param {IskraPanelSegment} segment
 */
export function buildAdviceModeRule(message, segment = 'sales') {
  if (!isIskraAdviceQuestion(message)) return ''
  if (segment === 'sales') {
    return [
      'РЕЖИМ СОВЕТА (продажи):',
      '1) Назови отстающее направление (ПЗ/ТЗ/АЗ или структура НК/ДК/УК) из insights.direction_plan и sales_contour.',
      '2) Свяжи факты только из отчёта менеджера (выручка, ПЗ, план) — логика факт → вывод → 2–3 шага.',
      '3) Используй club_playbooks и отраслевой опыт; не общие фразы.',
      '4) Если не хватает контекста — один уточняющий вопрос, не выдумывай цифры.',
    ].join('\n')
  }
  return [
    'РЕЖИМ СОВЕТА (тренеры):',
    'Опирайся на trainer_contour: нагрузка, неактивные, тренировки без типа карты.',
    'Не давай советов по плану продаж и марже — это другой сегмент.',
  ].join('\n')
}

/**
 * Урезает JSON-контекст промпта под активный сегмент панели.
 * @param {object | null | undefined} block
 * @param {IskraPanelSegment} segment
 * @param {string | null | undefined} trainerId
 */
export function filterPromptDataBlockForSegment(block, segment = 'sales', trainerId = null) {
  if (!block || typeof block !== 'object') return block

  const sid = String(trainerId ?? '').trim()
  const focus = resolvePanelAnalysisFocus({ segment, trainerId: sid })
  const next = { ...block, panel_segment: segment, analysis_focus: focus }

  if (segment === 'trainer') {
    next.sales_contour = null
    next.finance = null
    next.club_finance = null
    next.month_forecast = null
    next.sales_advice_context = null
    next.sales_inactive_signal = null
    delete next.trainers_summary
    next.insights = null
    next.trainings = null
    if (next.previous_period) {
      next.previous_period = {
        period: next.previous_period.period ?? null,
        trainer_contour: next.previous_period.trainer_contour ?? null,
      }
    }
    return next
  }

  const inactive =
    Number(block.trainer_contour?.club_roll_up?.inactive_clients_holders) ||
    Number(block.sales_inactive_signal) ||
    0

  next.sales_inactive_signal = inactive > 0 ? inactive : null
  next.trainer_contour =
    inactive > 0
      ? { club_roll_up: { inactive_clients_holders: inactive }, contour: 'trainer_tablets_signal_only' }
      : null
  delete next.trainers_summary

  return next
}

/**
 * @param {string} [message]
 * @param {IskraPanelSegment} segment
 */
export function shouldPreferGeminiForPanelQuestion(message, segment = 'sales') {
  if (isIskraAdviceQuestion(message)) return true
  if (segment === 'sales' && isDirectionDiagnosticsQuestion(message)) return true
  return false
}

/**
 * @param {string} [message]
 * @param {IskraPanelSegment} segment
 */
export function isPayrollAllTrainersQuestion(message, segment = 'sales') {
  if (segment !== 'sales') return false
  return PAYROLL_ALL_RE.test(String(message ?? ''))
}
