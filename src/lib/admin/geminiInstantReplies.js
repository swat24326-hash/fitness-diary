/** Мгновенные ответы ИСКРЫ на chips — только готовые поля snapshot, без Gemini. */

import { ISKRA_NAME } from './geminiIskraCore.js'
import { GEMINI_LEXICON_POOLS } from './geminiAnalyticsDomain.js'
import { buildGeminiIntroReply, GEMINI_INTRO_CHIP } from './geminiAssistantIntro.js'
import {
  comparePlanToCalendar,
  formatCalendarContextLine,
  resolveCalendarContext,
} from './geminiMonthCalendarContext.js'
import {
  formatPlanDirectionLagLine,
  formatPlanDirectionsDetail,
} from './geminiPlanDirections.js'
import { formatRub } from './salesReportCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'

/** @typedef {'intro'|'plan'|'gap'|'compare'|'fitcity'|'finance'|'pnk'|'bestday'|'trainer_inactive'|'payroll_gap'|'sales_coverage'|'sales_structure'|'sales_refunds'|'sales_directions'} GeminiChipId */

export const GEMINI_QUICK_CHIPS = [
  GEMINI_INTRO_CHIP,
  {
    id: 'plan',
    label: 'План продаж',
    message: 'Как выполнен план продаж за этот месяц?',
    compare: false,
  },
  {
    id: 'sales_coverage',
    label: 'Отчёты',
    message: 'Насколько заполнена база дневных отчётов менеджера за месяц?',
    compare: false,
  },
  {
    id: 'sales_structure',
    label: 'НК/ДК/УК',
    message: 'Какая структура выручки НК, ДК, УК и доп. продаж за месяц?',
    compare: false,
  },
  {
    id: 'sales_refunds',
    label: 'Возвраты',
    message: 'Как возвраты повлияли на чистую прибыль и план продаж?',
    compare: false,
  },
  {
    id: 'sales_directions',
    label: 'ПЗ/ТЗ/АЗ',
    message: 'Как выполнен план по направлениям ПЗ, ТЗ и АЗ?',
    compare: false,
  },
  {
    id: 'pnk',
    label: 'ПНК',
    message: 'Сколько ПНК за месяц и как с этим?',
    compare: false,
  },
  {
    id: 'bestday',
    label: 'Лучший день',
    message: 'Какой день по прибыли был лучший в этом месяце?',
    compare: false,
  },
  {
    id: 'gap',
    label: 'Риски месяца',
    message: 'Какие главные риски и отклонения в цифрах за месяц?',
    compare: false,
  },
  {
    id: 'compare',
    label: 'С прошлым месяцем',
    message: 'Сравни с прошлым месяцем — что лучше, что хуже?',
    compare: true,
  },
  {
    id: 'fitcity',
    label: 'FIT-CITY vs отчёт',
    message:
      'Сходятся ли ручной отчёт и FIT-CITY? Помни — в системе только тренеры с планшетом.',
    compare: false,
  },
  {
    id: 'finance',
    label: 'ЗП и маржа',
    message: 'ЗП залов и чистая прибыль — норм или давит?',
    compare: false,
  },
  {
    id: 'trainer_inactive',
    label: 'Неактивные клиенты',
    message: 'Что у нас по неактивным клиентам у тренерского состава?',
    compare: false,
  },
  {
    id: 'payroll_gap',
    label: 'ЗП зала vs тренеры',
    message:
      'Почему в финансовом отчёте зарплата персонального зала одна сумма, а сумма личных зарплат тренеров может отличаться?',
    compare: false,
  },
]

function salesFrom(snapshot) {
  return snapshot?.sales ?? {}
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
  for (const chip of GEMINI_QUICK_CHIPS) {
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
  const snapshot = opts?.snapshot
  if (!snapshot) return null

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
      return buildFinanceReply(club, period, insights, opener, closer, seed)
    case 'pnk':
      return buildPnkReply(club, period, insights, opener, closer, seed)
    case 'bestday':
      return buildBestDayReply(club, period, snapshot, insights, opener, closer, seed)
    case 'trainer_inactive':
      return buildTrainerInactiveReply(club, period, snapshot, opener, closer)
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
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: план продаж на месяц не задан. Отчётов ${days} дней, покрытие ${coverage}%.${calendarLine(snapshot)} ${closer}.`
  }

  const calLine = calendarLine(snapshot)
  const cal = resolveCalendarContext(snapshot)
  const vsCalendar = planInsight.calendar_vs_plan ?? comparePlanToCalendar(pct, cal)
  const calendarNote =
    vsCalendar === 'behind'
      ? ' Отставание от ориентира по дате.'
      : vsCalendar === 'ahead'
        ? ' Опережает ориентир по дате.'
        : vsCalendar === 'on_track'
          ? ' В рабочем темпе относительно даты.'
          : ''

  const tone =
    planInsight.tone === 'strong'
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : planInsight.tone === 'ok'
        ? 'идём в рабочем темпе'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)
  const push = planInsight.tone === 'weak' ? ` ${pickWord(GEMINI_LEXICON_POOLS.push, seed + 1)}.` : ''
  const levelLine =
    achieved > 0 ? ` Закрыт порог уровня ${achieved}.` : ' Финальный порог ещё не достигнут.'
  const dirLine = formatPlanDirectionLagLine(insights)

  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: план ${pct}% — ${formatRub(profit)} из ${formatRub(plan)}, ${tone}.${levelLine}${dirLine}${calLine}${calendarNote} Отчётов ${days} дней (${coverage}%).${push} ${closer}.`
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
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: прошлый месяц не подгружен — повторите запрос или проверьте отчёты. ${closer}.`
  }

  const prevLabel = mom.previous_period_label || 'прошлый месяц'
  const delta = Number(mom.profit_delta) || 0
  const deltaPct = Number(mom.profit_delta_pct) || 0
  const curProfit = Number(mom.profit_current) || 0

  let profitLine
  if (mom.profit_direction === 'up') {
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}: +${formatRub(delta)} (${deltaPct > 0 ? '+' : ''}${deltaPct}%) к ${prevLabel}`
  } else if (mom.profit_direction === 'down') {
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}: ${formatRub(delta)} (${deltaPct}%) к ${prevLabel}`
  } else {
    profitLine = `выручка на уровне ${prevLabel} — ${formatRub(curProfit)}`
  }

  let planLine = ''
  if (mom.plan_direction === 'up') {
    planLine = ` План ${mom.plan_pct_current}% против ${mom.plan_pct_previous}% — улучшение.`
  } else if (mom.plan_direction === 'down') {
    planLine = ` План ${mom.plan_pct_current}% против ${mom.plan_pct_previous}% — снижение.`
  }

  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}, ${profitLine}.${planLine} ${closer}.`
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

function buildFinanceReply(club, period, insights, opener, closer, seed) {
  const fin = insights.finance
  if (!fin) {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: блок финансов не передан в этом запросе. ${closer}.`
  }

  const net = Number(fin.net_profit) || 0
  const payroll = Number(fin.trainer_payroll) || 0
  const payrollShare = Number(fin.payroll_share_pct) || 0

  if (fin.margin_tone === 'negative') {
    return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: чистая прибыль ${formatRub(net)} — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}; ЗП персонального зала ${formatRub(payroll)} (${payrollShare}% от валовой). ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
  }

  const tone =
    fin.margin_tone === 'strong'
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : fin.margin_tone === 'ok'
        ? 'терпимо'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)

  return `${ISKRA_NAME}: ${club}, ${period}. ${opener}: чистая ${formatRub(net)}, ЗП ПЗ ${formatRub(payroll)} (${payrollShare}% от ${formatRub(fin.gross)}) — ${tone}. ${closer}.`
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
