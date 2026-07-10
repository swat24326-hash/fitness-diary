/** Мгновенные ответы ИСКРЫ на chips — только готовые поля snapshot, без Gemini и без оценок модели. */

import { ISKRA_NAME } from './geminiIskraCore.js'
import { buildIskraDataAvailability, iskraUnavailableHint } from './iskraDataAvailability.js'
import { GEMINI_LEXICON_POOLS } from './geminiAnalyticsDomain.js'
import { buildGeminiIntroReply, GEMINI_INTRO_CHIP } from './geminiAssistantIntro.js'
import {
  comparePlanToCalendar,
  formatCalendarContextLine,
  formatPlanPaceLineCompact,
  resolveCalendarContext,
} from './geminiMonthCalendarContext.js'
import {
  formatPlanDirectionStatusLine,
  formatPlanDirectionsDetail,
} from './geminiPlanDirections.js'
import { phrasePlanSnapshotLine } from './iskraReplyPhrasing.js'
import { formatRub } from './salesReportCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'

/** @typedef {'intro'|'plan'|'gap'|'compare'|'fitcity'|'finance'|'pnk'|'bestday'|'trainer_inactive'|'payroll_gap'|'sales_coverage'|'sales_structure'|'sales_refunds'|'sales_directions'|'month_forecast'|'trainer_trainings'|'trainer_salary'|'trainer_clients'|'trainer_no_type'|'trainer_rank'} GeminiChipId */

/** Все chip-id с мгновенным ответом (в т.ч. без кнопки в UI). */
export const GEMINI_INSTANT_CHIPS = [
  { ...GEMINI_INTRO_CHIP, quick: true },
  {
    id: 'plan',
    label: 'План продаж',
    message: 'Как выполнен план продаж за этот месяц?',
    compare: false,
    quick: true,
  },
  {
    id: 'gap',
    label: 'Риски месяца',
    message: 'Какие главные риски и отклонения в цифрах за месяц?',
    compare: false,
    quick: true,
  },
  {
    id: 'compare',
    label: 'С прошлым месяцем',
    message: 'Сравни с прошлым месяцем — что лучше, что хуже?',
    compare: true,
    quick: true,
  },
  {
    id: 'sales_structure',
    label: 'НК/ДК/УК',
    message: 'Какая структура выручки НК, ДК, УК и доп. продаж за месяц?',
    compare: false,
    quick: true,
  },
  {
    id: 'finance',
    label: 'ЗП и маржа',
    message: 'ЗП залов и чистая прибыль — норм или давит?',
    compare: false,
    quick: true,
  },
  {
    id: 'month_forecast',
    label: 'Прогноз месяца',
    message: 'Какой прогноз на месяц по выручке, плану и чистой прибыли?',
    compare: false,
    quick: true,
  },
  {
    id: 'sales_coverage',
    label: 'Отчёты',
    message: 'Насколько заполнена база дневных отчётов менеджера за месяц?',
    compare: false,
    quick: false,
  },
  {
    id: 'sales_refunds',
    label: 'Возвраты',
    message: 'Как возвраты повлияли на чистую прибыль и план продаж?',
    compare: false,
    quick: false,
  },
  {
    id: 'sales_directions',
    label: 'ПЗ/ТЗ/АЗ',
    message: 'Как выполнен план по направлениям ПЗ, ТЗ и АЗ?',
    compare: false,
    quick: false,
  },
  {
    id: 'pnk',
    label: 'ПНК',
    message: 'Сколько ПНК за месяц и как с этим?',
    compare: false,
    quick: false,
  },
  {
    id: 'bestday',
    label: 'Лучший день',
    message: 'Какой день по прибыли был лучший в этом месяце?',
    compare: false,
    quick: false,
  },
  {
    id: 'fitcity',
    label: 'FIT-CITY vs отчёт',
    message:
      'Сходятся ли ручной отчёт и FIT-CITY? Помни — в системе только тренеры с планшетом.',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_inactive',
    label: 'Неактивные клиенты',
    message: 'Что у нас по неактивным клиентам у тренерского состава?',
    compare: false,
    quick: false,
  },
  {
    id: 'payroll_gap',
    label: 'ЗП зала vs тренеры',
    message:
      'Почему в финансовом отчёте зарплата персонального зала одна сумма, а сумма личных зарплат тренеров может отличаться?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_trainings',
    label: 'Тренировки',
    message: 'Сколько завершённых тренировок у этого тренера за месяц?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_salary',
    label: 'Личная ЗП',
    message: 'Какая личная зарплата тренера за месяц по планшетам?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_clients',
    label: 'Клиенты',
    message: 'Сколько активных и неактивных клиентов у тренера?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_inactive',
    label: 'Неактивные',
    message: 'Сколько неактивных клиентов у этого тренера и что с этим делать?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_no_type',
    label: 'Без типа',
    message: 'Есть ли у тренера тренировки без типа карты и как это влияет на ЗП?',
    compare: false,
    quick: false,
  },
  {
    id: 'trainer_rank',
    label: 'Место в клубе',
    message: 'Как тренер выглядит на фоне других тренеров клуба по тренировкам?',
    compare: false,
    quick: false,
  },
]

/** Кнопки в панели ИСКРЫ — только самые частые запросы. */
export const GEMINI_QUICK_CHIPS = GEMINI_INSTANT_CHIPS.filter((chip) => chip.quick !== false)

/** Быстрые кнопки при фокусе на конкретном тренере. */
const TRAINER_PANEL_CHIP_IDS = [
  'trainer_trainings',
  'trainer_salary',
  'trainer_clients',
  'trainer_inactive',
  'trainer_no_type',
  'trainer_rank',
]

export const GEMINI_TRAINER_QUICK_CHIPS = [
  {
    ...GEMINI_INTRO_CHIP,
    message: 'Кто ты и что можешь по работе тренера за месяц?',
    quick: true,
  },
  ...TRAINER_PANEL_CHIP_IDS.map((id) => {
    const chip =
      GEMINI_INSTANT_CHIPS.find((c) => c.id === id && c.message.includes('этого тренера')) ??
      GEMINI_INSTANT_CHIPS.find((c) => c.id === id)
    return { ...chip, quick: true }
  }),
]

function salesFrom(snapshot) {
  return snapshot?.sales ?? {}
}

function selectedTrainerRow(snapshot) {
  const contour = snapshot?.trainer_contour
  if (!contour) return null
  if (contour.selected_trainer?.trainer_id) return contour.selected_trainer
  const sid = String(contour.selected_trainer_id ?? '').trim()
  if (!sid) return null
  return (contour.trainers ?? []).find((t) => t.trainer_id === sid) ?? null
}

function trainerNameFromRow(row, fallback = 'тренер') {
  return String(row?.trainer_name ?? '').trim() || fallback
}

export function normalizeGeminiChipMessage(message) {
  return String(message ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

export function matchGeminiInstantChip(userMessage, comparePrevious = false) {
  const normalized = normalizeGeminiChipMessage(userMessage)
  for (const chip of GEMINI_INSTANT_CHIPS) {
    if (normalizeGeminiChipMessage(chip.message) !== normalized) continue
    if (chip.compare && !comparePrevious) return null
    return chip.id
  }
  return null
}

function pickWord(pool, seed) {
  if (!pool?.length) return ''
  const i = Math.abs(seed) % pool.length
  return pool[i]
}

function capitalizeSentence(text) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`
}

function formatPushLine(seed) {
  const raw = pickWord(GEMINI_LEXICON_POOLS.push, seed)
  if (!raw) return ''
  return ` ${capitalizeSentence(raw.endsWith('.') ? raw : `${raw}.`)}`
}

function replySeed(chipId, periodLabel) {
  return String(chipId + periodLabel)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}

function toneWord(tone, seed, pools) {
  if (tone === 'strong') return pickWord(pools.praise, seed)
  if (tone === 'ok') return 'в пределах нормы'
  return pickWord(pools.critique, seed)
}

export function buildGeminiInstantReply(chipId, opts) {
  const rawSnapshot = opts?.snapshot
  if (!rawSnapshot) return null

  const snapshot = {
    ...rawSnapshot,
    data_availability:
      rawSnapshot.data_availability ??
      buildIskraDataAvailability(rawSnapshot, {
        hasPreviousPeriod: !!opts?.previousSnapshot,
        selectedTrainerId: rawSnapshot.trainer_contour?.selected_trainer_id,
      }),
  }

  const club = String(snapshot.club_name ?? '').trim() || 'клуб'
  const period =
    snapshot.period?.label ||
    periodLabelRu(snapshot.period?.year, snapshot.period?.month)
  const seed = replySeed(chipId, period)
  const opener = pickWord(GEMINI_LEXICON_POOLS.openers, seed)
  const closer = pickWord(GEMINI_LEXICON_POOLS.closers, seed + 3)
  const insights = snapshot.insights ?? {}

  switch (chipId) {
    case 'intro':
      return buildGeminiIntroReply('standard', {
        snapshot,
        previousSnapshot: opts.previousSnapshot,
        gender: opts.gender,
        clubName: snapshot?.club_name,
        periodLabel: snapshot?.period?.label,
      })
    case 'plan':
      return buildPlanReply(club, period, snapshot, insights, opener, closer, seed)
    case 'gap':
      return buildGapReply(club, period, insights, opener, closer, seed)
    case 'compare':
      return buildCompareReply(club, period, insights, opener, closer, seed)
    case 'fitcity':
      return buildFitcityReply(club, period, insights, opener, closer, seed)
    case 'finance':
      return buildFinanceReply(club, period, insights, opener, closer, seed, snapshot)
    case 'pnk':
      return buildPnkReply(club, period, insights, opener, closer, seed)
    case 'bestday':
      return buildBestDayReply(club, period, snapshot, insights, opener, closer, seed)
    case 'trainer_inactive':
      return buildTrainerInactiveReply(club, period, snapshot, opener, closer)
    case 'trainer_trainings':
      return buildTrainerTrainingsReply(club, period, snapshot, opener, closer)
    case 'trainer_salary':
      return buildTrainerSalaryReply(club, period, snapshot, opener, closer)
    case 'trainer_clients':
      return buildTrainerClientsReply(club, period, snapshot, opener, closer)
    case 'trainer_no_type':
      return buildTrainerNoTypeReply(club, period, snapshot, opener, closer)
    case 'trainer_rank':
      return buildTrainerRankReply(club, period, snapshot, opener, closer, seed)
    case 'payroll_gap':
      return buildPayrollGapReply(club, period, snapshot, insights, opener, closer)
    case 'sales_coverage':
      return buildSalesCoverageReply(club, period, snapshot, insights, opener, closer)
    case 'sales_structure':
      return buildSalesStructureReply(club, period, insights, opener, closer)
    case 'sales_refunds':
      return buildSalesRefundsReply(club, period, snapshot, insights, opener, closer)
    case 'sales_directions':
      return buildSalesDirectionsReply(club, period, insights, opener, closer)
    case 'month_forecast':
      return buildMonthForecastReply(club, period, snapshot, opener, closer, seed)
    default:
      return null
  }
}

function calendarLine(snapshot) {
  return formatCalendarContextLine(resolveCalendarContext(snapshot))
}

function buildPlanReply(club, period, snapshot, insights, opener, closer, seed) {
  const sales = salesFrom(snapshot)
  const planInsight = insights.plan ?? {}
  const report = insights.report ?? {}
  const profit = Number(planInsight.profit_total ?? sales.profit_total) || 0
  const plan = Number(planInsight.plan_total ?? sales.plan_total) || 0
  const pct = Number(planInsight.pct ?? sales.plan_progress_pct) || 0
  const coverage = Number(report.coverage_pct ?? sales.report_coverage_pct) || 0
  const days = Number(report.days_with_reports ?? sales.days_with_reports) || 0
  const achieved = Number(planInsight.achieved_level ?? sales.achieved_plan_level) || 0

  if (!planInsight.has_plan && plan <= 0) {
    return `${ISKRA_NAME}: ${club}, ${period}. План на месяц не задан. Отчётность ${coverage}%, ${days} дней.${calendarLine(snapshot)} ${closer}.`
  }

  const cal = resolveCalendarContext(snapshot)
  const vsCalendar = planInsight.calendar_vs_plan ?? comparePlanToCalendar(pct, cal)
  const paceLine = formatPlanPaceLineCompact(cal, vsCalendar)
  const dirLine = formatPlanDirectionStatusLine(insights)
  const levelLine = achieved > 0 ? ` Уровень ${achieved} закрыт.` : ''
  const push =
    planInsight.tone === 'weak' || vsCalendar === 'behind' ? formatPushLine(seed + 1) : ''
  const praise =
    planInsight.tone === 'strong' ? ` ${capitalizeSentence(pickWord(GEMINI_LEXICON_POOLS.praise, seed))}.` : ''

  let forecastLine = ''
  const cf = snapshot?.club_finance
  if (cf?.available && cf.forecast?.plan_pct != null) {
    forecastLine = ` Прогноз ${formatPctPlain(cf.forecast.plan_pct)}%`
    if (cf.forecast.net_profit_rub != null) {
      forecastLine += `, прибыль ${formatRub(cf.forecast.net_profit_rub)}`
    }
    forecastLine += '.'
  }

  return `${ISKRA_NAME}: ${club}, ${period}. ${phrasePlanSnapshotLine(pct, profit, plan)}.${paceLine}${dirLine}${levelLine}${forecastLine}${push}${praise} На связи.`
}

function formatPctPlain(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

function buildGapReply(club, period, insights, opener, closer, seed) {
  const issues = insights.issues ?? []
  if (!issues.length) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: критических отклонений не зафиксировано — ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
  }

  const main = issues[0].text
  const second = issues[1]?.text
  const tail = second ? ` Дополнительно: ${second}.` : ''
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: главный риск — ${main}.${tail} ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
}

function buildCompareReply(club, period, insights, opener, closer, seed) {
  const mom = insights.mom_comparison
  if (!mom) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: прошлый месяц не подгружен — повторите запрос или проверьте отчёты. На связи.`
  }

  const prevLabel = mom.previous_period_label || 'прошлый месяц'
  const delta = Number(mom.profit_delta) || 0
  const deltaPct = mom.profit_delta_pct
  const curProfit = Number(mom.profit_current) || 0
  const curPlan = formatPctPlain(mom.plan_pct_current)

  let profitLine
  if (mom.profit_previous_missing || mom.profit_direction === 'no_previous') {
    profitLine =
      curProfit > 0
        ? `выручка ${formatRub(curProfit)}; за ${prevLabel} данных нет — сравнить нельзя`
        : `за ${prevLabel} данных нет — сравнить не с чем`
  } else if (mom.profit_direction === 'up') {
    const pct =
      deltaPct != null && Number.isFinite(Number(deltaPct))
        ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct}%)`
        : ''
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}: +${formatRub(delta)}${pct} к ${prevLabel}`
  } else if (mom.profit_direction === 'down') {
    const pct = deltaPct != null && Number.isFinite(Number(deltaPct)) ? ` (${deltaPct}%)` : ''
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}: ${formatRub(delta)}${pct} к ${prevLabel}`
  } else {
    profitLine = `выручка на уровне ${prevLabel} — ${formatRub(curProfit)}`
  }

  let planLine = ''
  if (mom.plan_previous_missing) {
    if ((Number(mom.plan_pct_current) || 0) > 0) {
      planLine = ` План ${curPlan}% — за ${prevLabel} данных нет.`
    }
  } else if (mom.plan_direction === 'up') {
    planLine = ` План ${curPlan}% против ${formatPctPlain(mom.plan_pct_previous)}% — улучшение.`
  } else if (mom.plan_direction === 'down') {
    planLine = ` План ${curPlan}% против ${formatPctPlain(mom.plan_pct_previous)}% — снижение.`
  }

  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}, ${profitLine}.${planLine} На связи.`
}

function buildFitcityReply(club, period, insights, opener, closer, seed) {
  const fc = insights.fitcity ?? {}
  const manager = Number(fc.manager_total) || 0
  const fitCity = Number(fc.fit_city_total) || 0
  const gap = Number(fc.gap) || 0

  if (fc.status === 'empty') {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: в отчёте и FIT-CITY данных нет — база не заполнена. ${closer}.`
  }
  if (fc.status === 'aligned') {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: отчёт и FIT-CITY совпали — ${manager} тренировок, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
  }
  if (fc.status === 'manager_higher') {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: в отчёте ${manager}, на планшетах ${fitCity} — разница ${gap}; часть зала может быть без планшета. Сверьте с менеджером. ${closer}.`
  }
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: FIT-CITY (${fitCity}) больше отчёта (${manager}) — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}, проверьте дневные отчёты. ${closer}.`
}

function buildFinanceReply(club, period, insights, opener, closer, seed, snapshot) {
  const cf = snapshot?.club_finance
  const fin = insights.finance ?? snapshot?.finance
  if (!fin && !cf?.available) {
    const hint = iskraUnavailableHint(snapshot?.data_availability, 'finance')
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: ${hint} ${closer}.`
  }

  const net = Number(fin?.net_profit ?? cf?.fact?.net_profit_rub) || 0
  const payroll = Number(fin?.trainer_payroll ?? cf?.fact?.trainer_payroll_rub) || 0
  const expense = Number(fin?.supervisor_expense ?? cf?.fact?.supervisor_expense_rub) || 0

  let forecastLine = ''
  if (cf?.available && cf.forecast?.net_profit_rub != null) {
    forecastLine = ` Прогноз чистой прибыли к концу месяца — ${formatRub(cf.forecast.net_profit_rub)}.`
  }

  let hallsLine = ''
  const halls = cf?.fact?.halls
  if (halls) {
    hallsLine = ` По залам сейчас: ПЗ ${formatRub(halls.pz_net_profit_rub)}, ТЗ ${formatRub(halls.tz_revenue_rub)}, АЗ ${formatRub(halls.az_net_profit_rub)}.`
  }

  const tone =
    net < 0
      ? pickWord(GEMINI_LEXICON_POOLS.critique, seed)
      : net > 0
        ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
        : 'на нуле'

  return `${ISKRA_NAME}: ${club}, ${period}. Чистая прибыль ${formatRub(net)} — ${tone}. ЗП ПЗ ${formatRub(payroll)}, расход управляющего ${formatRub(expense)}.${hallsLine}${forecastLine} ${closer}.`
}

function formatDayRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(iso ?? '').trim() || '—'
  return `${Number(m[3])}.${Number(m[2])}`
}

function buildPnkReply(club, period, insights, opener, closer, seed) {
  const pnkInsight = insights.pnk ?? {}
  const report = insights.report ?? {}
  const pnk = Number(pnkInsight.total) || 0
  const coverage = Number(report.coverage_pct) || 0
  const days = Number(report.days_with_reports) || 0

  if (days <= 0) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: отчётов нет — ПНК не определён. ${closer}.`
  }

  const tone = toneWord(pnkInsight.tone, seed, GEMINI_LEXICON_POOLS)
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: ПНК за месяц ${pnk} шт — ${tone}. Покрытие отчётов ${coverage}%. ${closer}.`
}

function buildBestDayReply(club, period, snapshot, insights, opener, closer, seed) {
  const sales = salesFrom(snapshot)
  const best =
    insights.highlights?.best_day ?? sales.profit_day_highlights?.best_day
  if (!best?.date) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: нет дней с отчётом — лучший день не определён. ${closer}.`
  }

  const dayLabel = formatDayRu(best.date)
  const amount = formatRub(Number(best.profit) || 0)
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: лучший день ${dayLabel} — ${amount}, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
}

function buildTrainerInactiveReply(club, period, snapshot, opener, closer) {
  const row = selectedTrainerRow(snapshot)
  if (row) {
    const name = trainerNameFromRow(row)
    const inactive = Number(row.inactive_clients_holders) || 0
    const tail =
      inactive > 0
        ? 'Список — в карточках клиентов тренера.'
        : 'Все закреплённые клиенты с действующим абонементом.'
    return `${ISKRA_NAME}: ${name}, ${period}. ${opener}: неактивных клиентов — ${inactive} (без абонемента на конец периода). ${tail} На связи.`
  }

  const roll = snapshot.trainer_contour?.club_roll_up
  const inactive = Number(roll?.inactive_clients_holders) || 0
  const trainersCount = Number(roll?.trainers_count) || 0

  if (!trainersCount) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: по тренерам пока нет данных с планшетов или закреплённых клиентов. ${closer}.`
  }

  return (
    `${ISKRA_NAME}: ${club}, ${period}. ${opener}: у тренеров ${inactive} неактивных клиентов ` +
    `(без действующего абонемента на конец периода) — по ${trainersCount} тренерам. ` +
    `Это не продажи из отчёта менеджера, а картина по закреплённым клиентам; списки — в профиле каждого тренера. ${closer}.`
  )
}

function buildTrainerTrainingsReply(club, period, snapshot, opener, closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: выберите тренера в фокусе анализа. ${closer}.`
  }
  const name = trainerNameFromRow(row)
  const completed = Number(row.completed_trainings) || 0
  return `${ISKRA_NAME}: ${name}, ${period}. Завершённых тренировок — ${completed}. На связи.`
}

function buildTrainerSalaryReply(club, period, snapshot, opener, closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: выберите тренера в фокусе анализа. ${closer}.`
  }
  const name = trainerNameFromRow(row)
  const salary = Number(row.personal_salary_month) || 0
  const noType = Number(row.no_type_trainings_ignored) || 0
  const noTypeLine = noType > 0 ? ` Тренировки «Без типа» (${noType}) в ЗП не входят.` : ''
  return `${ISKRA_NAME}: ${name}, ${period}. Личная ЗП по планшетам — ${formatRub(salary)}.${noTypeLine} На связи.`
}

function buildTrainerClientsReply(club, period, snapshot, opener, closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: выберите тренера в фокусе анализа. ${closer}.`
  }
  const name = trainerNameFromRow(row)
  const total = Number(row.active_clients_total) || 0
  const active = Number(row.current_active_holders) || 0
  const inactive = Number(row.inactive_clients_holders) || 0
  return `${ISKRA_NAME}: ${name}, ${period}. Клиентов ${total}: с абонементом ${active}, неактивных ${inactive}. На связи.`
}

function buildTrainerNoTypeReply(club, period, snapshot, opener, closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: выберите тренера в фокусе анализа. ${closer}.`
  }
  const name = trainerNameFromRow(row)
  const noType = Number(row.no_type_trainings_ignored) || 0
  if (!noType) {
    return `${ISKRA_NAME}: ${name}, ${period}. Тренировок «Без типа» нет — личная ЗП считается по всем завершённым. На связи.`
  }
  return `${ISKRA_NAME}: ${name}, ${period}. Тренировок «Без типа» — ${noType}; они не входят в личную ЗП. На связи.`
}

function buildTrainerRankReply(club, period, snapshot, opener, closer, seed) {
  const row = selectedTrainerRow(snapshot)
  const trainers = snapshot.trainer_contour?.trainers ?? []
  if (!row) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: выберите тренера в фокусе анализа. ${closer}.`
  }
  if (!trainers.length) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: по тренерам пока нет данных. ${closer}.`
  }

  const name = trainerNameFromRow(row)
  const completed = Number(row.completed_trainings) || 0
  const sorted = [...trainers].sort(
    (a, b) =>
      (Number(b.completed_trainings) || 0) - (Number(a.completed_trainings) || 0) ||
      String(a.trainer_name).localeCompare(String(b.trainer_name), 'ru'),
  )
  const rank = sorted.findIndex((t) => t.trainer_id === row.trainer_id) + 1
  const total = trainers.length
  const clubSum = trainers.reduce((s, t) => s + (Number(t.completed_trainings) || 0), 0)
  const clubAvg = total > 0 ? Math.round((clubSum / total) * 10) / 10 : 0
  const vsAvg =
    completed > clubAvg
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : completed < clubAvg
        ? pickWord(GEMINI_LEXICON_POOLS.critique, seed)
        : 'на уровне среднего'
  return `${ISKRA_NAME}: ${name}, ${period}. ${completed} тренировок — ${rank}-е место из ${total}, среднее по клубу ${clubAvg}, ${vsAvg}. На связи.`
}

function buildPayrollGapReply(club, period, snapshot, insights, opener, closer) {
  const salesPayroll = Number(snapshot.finance?.trainer_payroll ?? insights.finance?.trainer_payroll) || 0
  const personalSum = Number(snapshot.trainer_contour?.club_roll_up?.personal_salary_sum) || 0

  return (
    `${ISKRA_NAME}: ${opener}. В финансовом отчёте зарплата персонального зала — ${formatRub(salesPayroll)} ` +
    `(как внесено менеджером для картины прибыли клуба). Сумма личных зарплат тренеров по факту тренировок с планшетов — ${formatRub(personalSum)}. ` +
    `Цифры могут расходиться: часть тренировок ещё не синхронизирована или есть занятия «Без типа», которые не входят в личную ЗП. ${club}, ${period}. ${closer}.`
  )
}

function buildSalesCoverageReply(club, period, snapshot, insights, opener, closer) {
  const sales = salesFrom(snapshot)
  const report = insights.report ?? {}
  const days = Number(report.days_with_reports ?? sales.days_with_reports) || 0
  const total = Number(report.days_in_month ?? snapshot.period?.days_in_month) || 0
  const coverage = Number(report.coverage_pct ?? sales.report_coverage_pct) || 0
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: отчётов ${days} из ${total} дней (${coverage}%).${calendarLine(snapshot)} Без дневных отчётов выводы по продажам предварительные. ${closer}.`
}

function buildSalesStructureReply(club, period, insights, opener, closer) {
  const st = insights.structure ?? {}
  const nk = Number(st.nk_share_pct) || 0
  const dk = Number(st.dk_share_pct) || 0
  const uk = Number(st.uk_share_pct) || 0
  const dop = Number(st.dop_share_pct) || 0
  const weak = st.weak_nk_vs_dk ? ' Слабая доля НК при опоре на ДК — риск по притоку новых.' : ''
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: структура выручки — НК ${nk}%, ДК ${dk}%, УК ${uk}%, доп. ${dop}%.${weak} ${closer}.`
}

function buildSalesRefundsReply(club, period, snapshot, insights, opener, closer) {
  const sales = salesFrom(snapshot)
  const plan = insights.plan ?? {}
  const gross = Number(plan.profit_gross_for_plan ?? sales.profit_gross_total) || 0
  const net = Number(plan.profit_total ?? sales.profit_total) || 0
  const refunds = Number(plan.refunds_total ?? sales.refunds_total) || 0
  return (
    `${ISKRA_NAME}: ${club}, ${period}. ${opener}: возвраты ${formatRub(refunds)}. ` +
    `На план это не влияет — он считается по валовой выручке ${formatRub(gross)}. ` +
    `Чистый заработок месяца после возвратов — ${formatRub(net)}. ${closer}.`
  )
}

function buildSalesDirectionsReply(club, period, insights, opener, closer) {
  const rows = insights.structure?.direction_rows ?? []
  const detail = formatPlanDirectionsDetail(rows, insights.direction_plan)
  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: ${detail} ${closer}.`
}

function buildMonthForecastReply(club, period, snapshot, opener, closer, seed) {
  const cf = snapshot?.club_finance
  const mf = snapshot?.month_forecast
  const block = cf?.available ? cf : mf

  if (!block?.available) {
    if (block?.reason === 'not_current_month') {
      return `${ISKRA_NAME}: ${club}, ${period}. Прогноз на конец месяца — только для текущего календарного месяца. ${closer}.`
    }
    if (block?.reason === 'insufficient_reports') {
      const need = Number(block.min_report_days) || 3
      const have = Number(block.report_days) || 0
      return `${ISKRA_NAME}: ${club}, ${period}. Для прогноза нужно минимум ${need} отчётов — сейчас ${have}. ${closer}.`
    }
    return `${ISKRA_NAME}: ${club}, ${period}. Прогноз пока недоступен — мало данных. ${closer}.`
  }

  const gross = Number(cf?.forecast?.gross_rub ?? mf?.forecast_gross_total) || 0
  const plan = Number(cf?.fact?.plan_target_rub ?? mf?.plan_level_3) || 0
  const pct = Number(cf?.forecast?.plan_pct ?? mf?.forecast_plan_pct) || 0
  const shortfall = Number(cf?.forecast?.shortfall_rub ?? mf?.shortfall_rub) || 0
  const surplus = Number(cf?.forecast?.surplus_rub ?? mf?.surplus_rub) || 0
  const netProfit = cf?.forecast?.net_profit_rub ?? mf?.forecast_net_profit

  let planLine = ''
  if (plan > 0) {
    if (surplus > 0) {
      planLine = ` План ${formatRub(plan)}: прогноз ${pct}% — переработаем на ${formatRub(surplus)}.`
    } else if (shortfall > 0) {
      planLine = ` План ${formatRub(plan)}: прогноз ${pct}% — не дотянем ${formatRub(shortfall)}.`
      if (pct < 90) planLine += formatPushLine(seed + 2)
    } else {
      planLine = ` План ${formatRub(plan)}: прогноз ${pct}% — в цель.`
    }
  } else {
    planLine = ` План не задан — прогноз вала ${formatRub(gross)}.`
  }

  let profitLine = ''
  if (netProfit != null && Number.isFinite(Number(netProfit))) {
    const net = Number(netProfit)
    const tone =
      net < 0
        ? pickWord(GEMINI_LEXICON_POOLS.critique, seed)
        : net > 0
          ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
          : 'на нуле'
    profitLine = ` Чистая прибыль к концу месяца — ${formatRub(net)}, ${tone}.`
  }

  let dirLine = ''
  const directions = cf?.forecast?.directions ?? []
  const lagging = directions.filter(
    (d) => (Number(d.plan_target_rub) || 0) > 0 && (Number(d.forecast_progress_pct) || 0) < 90,
  )
  if (lagging.length) {
    const parts = lagging.map(
      (d) => `${d.label} ${d.forecast_progress_pct}%`,
    )
    dirLine = ` По прогнозу отстают: ${parts.join(', ')}.`
  }

  return `${ISKRA_NAME}: ${club}, ${period}. Прогноз вала на конец месяца — ${formatRub(gross)}.${planLine}${profitLine}${dirLine} ${closer}.`
}
