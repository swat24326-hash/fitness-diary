/** Мгновенные ответы ИСКРЫ на chips — только готовые поля snapshot, без Gemini и без оценок модели. */

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
import { formatNetProfitMarginPercent } from './clubNetProfitMarginCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'
import { iskraReplyHeader, iskraTrainerHeader, joinIskraReply } from './iskraReplyCompact.js'
import { buildIskraAdviceReply } from './iskraBusinessAdvice.js'
import { buildIskraAppGuideReply } from './iskraAppGuide.js'

/** @typedef {'intro'|'advice'|'advice_plan'|'app_guide'|'app_sync'|'app_structure'|'plan'|'gap'|'compare'|'fitcity'|'finance'|'pnk'|'bestday'|'trainer_inactive'|'payroll_gap'|'sales_coverage'|'sales_structure'|'sales_refunds'|'sales_directions'|'month_forecast'|'trainer_trainings'|'trainer_salary'|'trainer_clients'|'trainer_no_type'|'trainer_rank'|'trainer_summary'} GeminiChipId */

/** Все chip-id с мгновенным ответом (в т.ч. без кнопки в UI). */
export const GEMINI_INSTANT_CHIPS = [
  { ...GEMINI_INTRO_CHIP, quick: true },
  {
    id: 'advice',
    label: 'Что делать',
    message: 'Что сделать сейчас, чтобы улучшить результат месяца?',
    compare: false,
    quick: true,
  },
  {
    id: 'advice_plan',
    label: 'Совет по плану',
    message:
      'Дай совет: какое направление просело и что делать по НК/ДК/УК и ПЗ/ТЗ/АЗ, чтобы дожать план?',
    compare: false,
    quick: true,
  },
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
    id: 'app_guide',
    label: 'Приложение',
    message: 'Как работать в FIT-CITY: клиенты, тренировки, разделы?',
    compare: false,
    quick: false,
  },
  {
    id: 'app_sync',
    label: 'Sync',
    message: 'Как синхронизировать данные и что делать офлайн?',
    compare: false,
    quick: false,
  },
  {
    id: 'app_structure',
    label: 'Структура',
    message: 'Где в админке организация, статистика и настройки?',
    compare: false,
    quick: false,
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
  {
    id: 'trainer_summary',
    label: 'Сводка тренера',
    message: 'Сводка по тренеру за этот месяц',
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
    case 'advice':
      return buildIskraAdviceReply(snapshot, {
        advisorRoleId: opts.advisorRoleId,
        club,
        period,
        focus: 'general',
      })
    case 'advice_plan':
      return buildIskraAdviceReply(snapshot, {
        advisorRoleId: opts.advisorRoleId,
        club,
        period,
        focus: 'plan',
      })
    case 'app_guide':
      return buildIskraAppGuideReply('general', {
        club,
        period,
        advisorRoleId: opts.advisorRoleId,
        userMessage: opts.userMessage,
      })
    case 'app_sync':
      return buildIskraAppGuideReply('sync', {
        club,
        period,
        advisorRoleId: opts.advisorRoleId,
        userMessage: opts.userMessage,
      })
    case 'app_structure':
      return buildIskraAppGuideReply('structure', {
        club,
        period,
        advisorRoleId: opts.advisorRoleId,
        userMessage: opts.userMessage,
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
    case 'trainer_summary':
      return buildTrainerSummaryReply(club, period, snapshot, opener, closer, seed)
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
    return joinIskraReply(
      iskraReplyHeader(club, period),
      `План не задан. Отчётность ${coverage}%, ${days} дн.${calendarLine(snapshot)}`,
    )
  }

  const cal = resolveCalendarContext(snapshot)
  const vsCalendar = planInsight.calendar_vs_plan ?? comparePlanToCalendar(pct, cal)
  const paceLine = formatPlanPaceLineCompact(cal, vsCalendar)
  const dirLine = formatPlanDirectionStatusLine(insights)
  const levelLine = achieved > 0 ? ` Уровень ${achieved}.` : ''
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

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `${phrasePlanSnapshotLine(pct, profit, plan)}.${paceLine}${dirLine}${levelLine}${forecastLine}${push}${praise}`,
  )
}

function formatPctPlain(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

function buildGapReply(club, period, insights, _opener, _closer, seed) {
  const issues = insights.issues ?? []
  if (!issues.length) {
    return joinIskraReply(
      iskraReplyHeader(club, period),
      `Без критичных отклонений — ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}.`,
    )
  }

  const main = issues[0].text
  const second = issues[1]?.text
  const tail = second ? ` ${second}.` : ''
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Риск: ${main}.${tail} ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}.`,
  )
}

function buildCompareReply(club, period, insights, _opener, _closer, seed) {
  const mom = insights.mom_comparison
  if (!mom) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Прошлый месяц не подгружен.')
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

  return joinIskraReply(iskraReplyHeader(club, period), `${profitLine}.${planLine}`)
}

function buildFitcityReply(club, period, insights, _opener, _closer, seed) {
  const fc = insights.fitcity ?? {}
  const manager = Number(fc.manager_total) || 0
  const fitCity = Number(fc.fit_city_total) || 0
  const gap = Number(fc.gap) || 0

  if (fc.status === 'empty') {
    return joinIskraReply(iskraReplyHeader(club, period), 'В отчёте и FIT-CITY данных нет.')
  }
  if (fc.status === 'aligned') {
    return joinIskraReply(
      iskraReplyHeader(club, period),
      `Отчёт и FIT-CITY совпали — ${manager} тренировок.`,
    )
  }
  if (fc.status === 'manager_higher') {
    return joinIskraReply(
      iskraReplyHeader(club, period),
      `В отчёте ${manager}, на планшетах ${fitCity} — разница ${gap}.`,
    )
  }
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `FIT-CITY ${fitCity}, отчёт ${manager} — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}.`,
  )
}

function buildFinanceReply(club, period, insights, _opener, _closer, seed, snapshot) {
  const cf = snapshot?.club_finance
  const fin = insights.finance ?? snapshot?.finance
  if (!fin && !cf?.available) {
    const hint = iskraUnavailableHint(snapshot?.data_availability, 'finance')
    return joinIskraReply(iskraReplyHeader(club, period), hint)
  }

  const net = Number(fin?.net_profit ?? cf?.fact?.net_profit_rub) || 0
  const payroll = Number(fin?.trainer_payroll ?? cf?.fact?.trainer_payroll_rub) || 0
  const marginPct =
    fin?.net_profit_margin_pct ?? cf?.fact?.net_profit_margin_pct ?? cf?.forecast?.net_profit_margin_pct
  const marginLabel = fin?.net_profit_margin_label_ru ?? cf?.fact?.net_profit_margin_label_ru

  let forecastLine = ''
  if (cf?.available && cf.forecast?.net_profit_rub != null) {
    forecastLine = ` Прогноз прибыли ${formatRub(cf.forecast.net_profit_rub)}.`
    const fcMargin = cf.forecast?.net_profit_margin_pct
    if (fcMargin != null && Number.isFinite(Number(fcMargin))) {
      forecastLine += ` Маржа ${formatNetProfitMarginPercent(fcMargin)}.`
    }
  }

  let marginLine = ''
  if (marginPct != null && Number.isFinite(Number(marginPct))) {
    marginLine = ` Маржа по валу ${formatNetProfitMarginPercent(marginPct)}${marginLabel ? ` (${marginLabel})` : ''}.`
  }

  const tone =
    net < 0
      ? pickWord(GEMINI_LEXICON_POOLS.critique, seed)
      : net > 0
        ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
        : 'на нуле'

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Прибыль ${formatRub(net)} — ${tone}. ЗП ПЗ ${formatRub(payroll)}.${marginLine}${forecastLine}`,
  )
}

function formatDayRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(iso ?? '').trim() || '—'
  return `${Number(m[3])}.${Number(m[2])}`
}

function buildPnkReply(club, period, insights, _opener, _closer, seed) {
  const pnkInsight = insights.pnk ?? {}
  const report = insights.report ?? {}
  const pnk = Number(pnkInsight.total) || 0
  const coverage = Number(report.coverage_pct) || 0
  const days = Number(report.days_with_reports) || 0

  if (days <= 0) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Отчётов нет — ПНК не определён.')
  }

  const tone = toneWord(pnkInsight.tone, seed, GEMINI_LEXICON_POOLS)
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `ПНК ${pnk} шт — ${tone}. Отчётность ${coverage}%.`,
  )
}

function buildBestDayReply(club, period, snapshot, insights, _opener, _closer, seed) {
  const sales = salesFrom(snapshot)
  const best =
    insights.highlights?.best_day ?? sales.profit_day_highlights?.best_day
  if (!best?.date) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Лучший день не определён.')
  }

  const dayLabel = formatDayRu(best.date)
  const amount = formatRub(Number(best.profit) || 0)
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Лучший день ${dayLabel} — ${amount}, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}.`,
  )
}

function buildTrainerInactiveReply(club, period, snapshot, _opener, _closer) {
  const row = selectedTrainerRow(snapshot)
  if (row) {
    const name = trainerNameFromRow(row)
    const inactive = Number(row.inactive_clients_holders) || 0
    const tail = inactive > 0 ? 'Список в карточке тренера.' : 'Все с абонементом.'
    return joinIskraReply(
      iskraTrainerHeader(name, period),
      `Неактивных клиентов — ${inactive}. ${tail}`,
    )
  }

  const roll = snapshot.trainer_contour?.club_roll_up
  const inactive = Number(roll?.inactive_clients_holders) || 0
  const trainersCount = Number(roll?.trainers_count) || 0

  if (!trainersCount) {
    return joinIskraReply(iskraReplyHeader(club, period), 'По тренерам данных нет.')
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Неактивных клиентов у тренеров — ${inactive}, тренеров ${trainersCount}.`,
  )
}

function buildTrainerTrainingsReply(club, period, snapshot, _opener, _closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Выберите тренера в фокусе.')
  }
  const name = trainerNameFromRow(row)
  const completed = Number(row.completed_trainings) || 0
  return joinIskraReply(iskraTrainerHeader(name, period), `Тренировок — ${completed}.`)
}

function buildTrainerSalaryReply(club, period, snapshot, _opener, _closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Выберите тренера в фокусе.')
  }
  const name = trainerNameFromRow(row)
  const salary = Number(row.personal_salary_month) || 0
  const noType = Number(row.no_type_trainings_ignored) || 0
  const noTypeLine = noType > 0 ? ` «Без типа» — ${noType}, в ЗП не входят.` : ''
  return joinIskraReply(
    iskraTrainerHeader(name, period),
    `Личная ЗП — ${formatRub(salary)}.${noTypeLine}`,
  )
}

function buildTrainerClientsReply(club, period, snapshot, _opener, _closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Выберите тренера в фокусе.')
  }
  const name = trainerNameFromRow(row)
  const total = Number(row.active_clients_total) || 0
  const active = Number(row.current_active_holders) || 0
  const inactive = Number(row.inactive_clients_holders) || 0
  return joinIskraReply(
    iskraTrainerHeader(name, period),
    `Клиентов ${total}: с абонементом ${active}, неактивных ${inactive}.`,
  )
}

function buildTrainerNoTypeReply(club, period, snapshot, _opener, _closer) {
  const row = selectedTrainerRow(snapshot)
  if (!row) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Выберите тренера в фокусе.')
  }
  const name = trainerNameFromRow(row)
  const noType = Number(row.no_type_trainings_ignored) || 0
  if (!noType) {
    return joinIskraReply(iskraTrainerHeader(name, period), 'Тренировок «Без типа» нет.')
  }
  return joinIskraReply(
    iskraTrainerHeader(name, period),
    `«Без типа» — ${noType}, в личную ЗП не входят.`,
  )
}

function buildTrainerRankReply(club, period, snapshot, _opener, _closer, seed) {
  const row = selectedTrainerRow(snapshot)
  const trainers = snapshot.trainer_contour?.trainers ?? []
  if (!row) {
    return joinIskraReply(iskraReplyHeader(club, period), 'Выберите тренера в фокусе.')
  }
  if (!trainers.length) {
    return joinIskraReply(iskraReplyHeader(club, period), 'По тренерам данных нет.')
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
  return joinIskraReply(
    iskraTrainerHeader(name, period),
    `${completed} тренировок — ${rank}-е из ${total}, среднее ${clubAvg}, ${vsAvg}.`,
  )
}

function buildTrainerSummaryReply(club, period, snapshot, _opener, _closer, _seed) {
  const row = selectedTrainerRow(snapshot)
  const trainers = snapshot.trainer_contour?.trainers ?? []

  if (!row) {
    const hint =
      trainers.length > 0
        ? ` Тренеры: ${trainers
            .slice(0, 4)
            .map((t) => trainerNameFromRow(t))
            .join(', ')}.`
        : ''
    return joinIskraReply(iskraReplyHeader(club, period), `Тренер не найден.${hint}`)
  }

  const name = trainerNameFromRow(row)
  const completed = Number(row.completed_trainings) || 0
  const salary = Number(row.personal_salary_month) || 0
  const total = Number(row.active_clients_total) || 0
  const active = Number(row.current_active_holders) || 0
  const inactive = Number(row.inactive_clients_holders) || 0
  const noType = Number(row.no_type_trainings_ignored) || 0

  let rankLine = ''
  if (trainers.length > 1) {
    const sorted = [...trainers].sort(
      (a, b) =>
        (Number(b.completed_trainings) || 0) - (Number(a.completed_trainings) || 0) ||
        String(a.trainer_name).localeCompare(String(b.trainer_name), 'ru'),
    )
    const rank = sorted.findIndex((t) => t.trainer_id === row.trainer_id) + 1
    rankLine = ` Место ${rank} из ${trainers.length}.`
  }

  const noTypeLine = noType > 0 ? ` «Без типа» — ${noType}.` : ''

  return joinIskraReply(
    iskraTrainerHeader(name, period),
    `Тренировок ${completed}, ЗП ${formatRub(salary)}, клиентов ${total} (активных ${active}, неактивных ${inactive}).${rankLine}${noTypeLine}`,
  )
}

function buildPayrollGapReply(club, period, snapshot, insights, _opener, _closer) {
  const salesPayroll = Number(snapshot.finance?.trainer_payroll ?? insights.finance?.trainer_payroll) || 0
  const personalSum = Number(snapshot.trainer_contour?.club_roll_up?.personal_salary_sum) || 0

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `В финансовом отчёте ЗП зала ${formatRub(salesPayroll)}, личных зарплат тренеров ${formatRub(personalSum)}. Расхождение — «Без типа» и синхронизация.`,
  )
}

function buildSalesCoverageReply(club, period, snapshot, insights, _opener, _closer) {
  const sales = salesFrom(snapshot)
  const report = insights.report ?? {}
  const days = Number(report.days_with_reports ?? sales.days_with_reports) || 0
  const total = Number(report.days_in_month ?? snapshot.period?.days_in_month) || 0
  const coverage = Number(report.coverage_pct ?? sales.report_coverage_pct) || 0
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Отчётов ${days} из ${total} (${coverage}%).${calendarLine(snapshot)}`,
  )
}

function buildSalesStructureReply(club, period, insights, _opener, _closer) {
  const st = insights.structure ?? {}
  const nk = Number(st.nk_share_pct) || 0
  const dk = Number(st.dk_share_pct) || 0
  const uk = Number(st.uk_share_pct) || 0
  const dop = Number(st.dop_share_pct) || 0
  const weak = st.weak_nk_vs_dk ? ' Слабая доля НК.' : ''
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `НК ${nk}%, ДК ${dk}%, УК ${uk}%, доп. ${dop}%.${weak}`,
  )
}

function buildSalesRefundsReply(club, period, snapshot, insights, _opener, _closer) {
  const sales = salesFrom(snapshot)
  const plan = insights.plan ?? {}
  const gross = Number(plan.profit_gross_for_plan ?? sales.profit_gross_total) || 0
  const net = Number(plan.profit_total ?? sales.profit_total) || 0
  const refunds = Number(plan.refunds_total ?? sales.refunds_total) || 0
  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Возвраты ${formatRub(refunds)}. План по валу ${formatRub(gross)}, чистыми ${formatRub(net)}.`,
  )
}

function buildSalesDirectionsReply(club, period, insights, _opener, _closer) {
  const rows = insights.structure?.direction_rows ?? []
  const detail = formatPlanDirectionsDetail(rows, insights.direction_plan)
  return joinIskraReply(iskraReplyHeader(club, period), detail)
}

function buildMonthForecastReply(club, period, snapshot, _opener, _closer, seed) {
  const cf = snapshot?.club_finance
  const mf = snapshot?.month_forecast
  const block = cf?.available ? cf : mf

  if (!block?.available) {
    if (block?.reason === 'not_current_month') {
      return joinIskraReply(iskraReplyHeader(club, period), 'Прогноз — только для текущего месяца.')
    }
    if (block?.reason === 'insufficient_reports') {
      const need = Number(block.min_report_days) || 3
      const have = Number(block.report_days) || 0
      return joinIskraReply(
        iskraReplyHeader(club, period),
        `Для прогноза нужно ${need} отчётов — сейчас ${have}.`,
      )
    }
    return joinIskraReply(iskraReplyHeader(club, period), 'Прогноз недоступен — мало данных.')
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
      planLine = ` План ${formatRub(plan)}: ${pct}% — запас ${formatRub(surplus)}.`
    } else if (shortfall > 0) {
      planLine = ` План ${formatRub(plan)}: ${pct}% — не дотянем ${formatRub(shortfall)}.`
      if (pct < 90) planLine += formatPushLine(seed + 2)
    } else {
      planLine = ` План ${formatRub(plan)}: ${pct}% — в цель.`
    }
  } else {
    planLine = ` План не задан, вал ${formatRub(gross)}.`
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
    profitLine = ` Прибыль ${formatRub(net)}, ${tone}.`
    const fcMargin = cf?.forecast?.net_profit_margin_pct ?? mf?.forecast_net_profit_margin_pct
    const fcMarginLabel = cf?.forecast?.net_profit_margin_label_ru ?? mf?.forecast_net_profit_margin_label_ru
    if (fcMargin != null && Number.isFinite(Number(fcMargin))) {
      profitLine += ` Маржа ${formatNetProfitMarginPercent(fcMargin)}${fcMarginLabel ? ` (${fcMarginLabel})` : ''}.`
    }
  }

  let dirLine = ''
  const directions = cf?.forecast?.directions ?? []
  const lagging = directions.filter(
    (d) => (Number(d.plan_target_rub) || 0) > 0 && (Number(d.forecast_progress_pct) || 0) < 90,
  )
  if (lagging.length) {
    const parts = lagging.map((d) => `${d.label} ${d.forecast_progress_pct}%`)
    dirLine = ` Отстают: ${parts.join(', ')}.`
  }

  return joinIskraReply(
    iskraReplyHeader(club, period),
    `Вал ${formatRub(gross)}.${planLine}${profitLine}${dirLine}`,
  )
}
