/**
 * Календарный контекст месяца для ЭВС «ИСКРА».
 * Учитывает: начало / середина / конец / осталось N дней, прошлый и будущий месяц.
 */

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 */
export function formatCalendarIso(year, month, day) {
  return `${Number(year)}-${pad2(Number(month))}-${pad2(Number(day))}`
}

/**
 * @param {number} planPct
 * @param {ReturnType<typeof buildGeminiMonthCalendarContext> | null | undefined} calendarContext
 * @returns {'ahead'|'on_track'|'behind'|null}
 */
export function comparePlanToCalendar(planPct, calendarContext) {
  if (!calendarContext || calendarContext.month_relation !== 'current') return null
  const expected = Number(calendarContext.expected_plan_progress_pct) || 0
  const pct = Number(planPct) || 0
  const slack = 8
  if (pct >= expected + slack) return 'ahead'
  if (pct >= expected - slack) return 'on_track'
  return 'behind'
}

/**
 * @param {number} planPct
 * @param {number} planTotal
 * @param {ReturnType<typeof buildGeminiMonthCalendarContext> | null | undefined} calendarContext
 */
export function shouldFlagLowPlan(planPct, planTotal, calendarContext) {
  if (planTotal <= 0) return false
  const pct = Number(planPct) || 0

  if (!calendarContext) return pct < 50

  if (calendarContext.month_relation === 'future') return false
  if (calendarContext.month_relation === 'past') return pct < 50

  const expected = Number(calendarContext.expected_plan_progress_pct) || 0
  const cmp = comparePlanToCalendar(pct, calendarContext)
  const phase = calendarContext.phase

  if (phase === 'start' || phase === 'early') {
    return pct < Math.max(5, expected - 20)
  }
  if (phase === 'final_days' || phase === 'last_day') {
    return pct < Math.min(90, expected)
  }
  return cmp === 'behind'
}

function planTone(pct) {
  if (pct >= 90) return 'strong'
  if (pct >= 55) return 'ok'
  return 'weak'
}

/**
 * @param {number} planPct
 * @param {ReturnType<typeof buildGeminiMonthCalendarContext> | null | undefined} calendarContext
 * @returns {'strong'|'ok'|'weak'}
 */
export function planToneWithCalendar(planPct, calendarContext) {
  const pct = Number(planPct) || 0
  if (!calendarContext || calendarContext.month_relation !== 'current') {
    return planTone(pct)
  }

  const cmp = comparePlanToCalendar(pct, calendarContext)
  if (cmp === 'ahead') return pct >= 90 ? 'strong' : 'ok'
  if (cmp === 'on_track') return 'ok'
  if (calendarContext.phase === 'start' && pct >= 5) return 'ok'
  return 'weak'
}

function resolveCalendarPhase(relation, calendarDay, daysInMonth, daysRemaining) {
  if (relation === 'future') return 'future_month'
  if (relation === 'past') return 'past_month'
  if (daysRemaining <= 0) return 'last_day'
  if (daysRemaining <= 3) return 'final_days'
  if (calendarDay <= Math.max(5, Math.floor(daysInMonth * 0.15))) return 'start'
  if (calendarDay <= Math.floor(daysInMonth / 3)) return 'early'
  if (calendarDay <= Math.floor((2 * daysInMonth) / 3)) return 'middle'
  return 'late'
}

function calendarPhaseLabelRu(phase, daysRemaining) {
  switch (phase) {
    case 'start':
      return 'начало месяца'
    case 'early':
      return 'первая треть месяца'
    case 'middle':
      return 'середина месяца'
    case 'late':
      return 'конец месяца'
    case 'final_days':
      return daysRemaining === 1 ? 'последний день месяца' : `до конца месяца ${daysRemaining} дн.`
    case 'last_day':
      return 'последний день месяца'
    case 'past_month':
      return 'месяц завершён'
    case 'future_month':
      return 'месяц ещё не начался'
    default:
      return ''
  }
}

function buildCalendarHints(opts) {
  const hints = []
  const {
    relation,
    phase,
    calendarDay,
    expectedPlanProgressPct,
  } = opts

  if (relation === 'current') {
    hints.push(`Сегодня ${calendarDay}-е число — ${opts.phaseLabelRu}.`)
    hints.push(`Линейный ориентир плана к сегодняшнему дню: ~${expectedPlanProgressPct}%.`)
    if (phase === 'start' || phase === 'early') {
      hints.push('Месяц только начался — низкий процент плана может быть нормой, не драматизируй.')
    }
    if (phase === 'middle') {
      hints.push('Середина месяца — сравнивай план с ориентиром по дате, а не с финальной 100%.')
    }
    if (phase === 'final_days' || phase === 'last_day') {
      hints.push('До конца месяца мало дней — оценивай план и отчёты строго, время на догон ограничено.')
    }
  } else if (relation === 'past') {
    hints.push('Анализируется завершённый месяц — оценивай план и отчёты по итогу.')
  } else {
    hints.push('Выбранный месяц ещё не наступил — выводы по плану преждевременны.')
  }

  return hints
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {Date} [today]
 */
export function buildGeminiMonthCalendarContext(year, month, today = new Date()) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null

  const daysInMonth = new Date(y, m, 0).getDate()
  const todayY = today.getFullYear()
  const todayM = today.getMonth() + 1
  const todayD = today.getDate()

  /** @type {'current'|'past'|'future'} */
  let monthRelation = 'past'
  if (y > todayY || (y === todayY && m > todayM)) monthRelation = 'future'
  else if (y === todayY && m === todayM) monthRelation = 'current'

  let calendarDay = null
  let daysRemaining = null
  let daysElapsed = null

  if (monthRelation === 'current') {
    calendarDay = todayD
    daysRemaining = Math.max(0, daysInMonth - todayD)
    daysElapsed = todayD
  } else if (monthRelation === 'past') {
    calendarDay = daysInMonth
    daysRemaining = 0
    daysElapsed = daysInMonth
  } else {
    calendarDay = 0
    daysRemaining = daysInMonth
    daysElapsed = 0
  }

  const elapsedPct = daysInMonth > 0 ? round1((daysElapsed / daysInMonth) * 100) : 0
  const expectedPlanProgressPct =
    monthRelation === 'future' ? 0 : round1((daysElapsed / daysInMonth) * 100)

  const phase = resolveCalendarPhase(monthRelation, calendarDay, daysInMonth, daysRemaining)
  const phaseLabelRu = calendarPhaseLabelRu(phase, daysRemaining)
  const hints = buildCalendarHints({
    relation: monthRelation,
    phase,
    calendarDay,
    daysRemaining,
    expectedPlanProgressPct,
    phaseLabelRu,
  })

  return {
    today_iso: formatCalendarIso(todayY, todayM, todayD),
    month_relation: monthRelation,
    calendar_day: calendarDay,
    days_in_month: daysInMonth,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    elapsed_pct: elapsedPct,
    expected_plan_progress_pct: expectedPlanProgressPct,
    phase,
    phase_label_ru: phaseLabelRu,
    hints,
  }
}

/** Краткая строка для мгновенных ответов — язык бизнеса. */
export function resolveCalendarContext(snapshot, today = new Date()) {
  const embedded = snapshot?.calendar_context
  if (embedded?.month_relation) return embedded

  const year = Number(snapshot?.period?.year)
  const month = Number(snapshot?.period?.month)
  if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
    return buildGeminiMonthCalendarContext(year, month, today)
  }

  return null
}

const MONTH_GENITIVE_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

/** @param {ReturnType<typeof buildGeminiMonthCalendarContext> | null | undefined} calendarContext */
export function formatTodayDateRu(calendarContext) {
  const iso = String(calendarContext?.today_iso ?? '')
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const day = Number(m[3])
  const month = Number(m[2])
  const year = Number(m[1])
  const label = MONTH_GENITIVE_RU[month - 1]
  if (!label || !Number.isFinite(day) || day <= 0) return null
  return `${day} ${label} ${year}`
}

/** Краткая строка для мгновенных ответов — язык бизнеса. */
export function formatCalendarContextLine(calendarContext) {
  if (!calendarContext?.month_relation) return ''
  if (calendarContext.month_relation === 'past') {
    return ' Месяц завершён — оценка по итогу.'
  }
  if (calendarContext.month_relation === 'future') {
    return ' Месяц ещё не начался.'
  }

  const day = Number(calendarContext.calendar_day)
  const phase = String(calendarContext.phase_label_ru ?? '').trim()
  const expected = calendarContext.expected_plan_progress_pct
  const dateRu = formatTodayDateRu(calendarContext)
  if (!Number.isFinite(day) || day <= 0 || !phase || expected == null) return ''

  const datePart = dateRu ? `Сегодня ${dateRu}` : `Сегодня ${day}-е число`
  return ` ${datePart}, ${phase}; ориентир плана к дате ~${expected}%.`
}
