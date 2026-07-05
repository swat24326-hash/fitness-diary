/** Мгновенные ответы на chips — без вызова Gemini, только snapshot. */

import { GEMINI_LEXICON_POOLS } from './geminiAnalyticsDomain.js'
import { buildGeminiIntroReply, GEMINI_INTRO_CHIP } from './geminiAssistantIntro.js'
import { formatRub } from './salesReportCore.js'
import { periodLabelRu } from './geminiAnalyticsSnapshot.js'

/** @typedef {'intro'|'plan'|'gap'|'compare'|'fitcity'|'finance'|'pnk'|'bestday'} GeminiChipId */

export const GEMINI_QUICK_CHIPS = [
  GEMINI_INTRO_CHIP,
  {
    id: 'plan',
    label: 'Че по плану?',
    message: 'Че там по плану продаж за этот месяц?',
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
    label: 'Где косяк?',
    message: 'Где главный косяк в цифрах за месяц?',
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
    label: 'ФОТ и маржа',
    message: 'ФОТ и чистая прибыль — норм или давит?',
    compare: false,
  },
]

export function normalizeGeminiChipMessage(message) {
  return String(message ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/**
 * @param {string} userMessage
 * @param {boolean} [comparePrevious]
 * @returns {GeminiChipId|null}
 */
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

/**
 * @param {GeminiChipId} chipId
 * @param {{ snapshot: object, previousSnapshot?: object|null, gender?: string }} opts
 * @returns {string|null}
 */
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
      return buildPlanReply(club, period, snapshot, opener, closer, seed)
    case 'gap':
      return buildGapReply(club, period, snapshot, opener, closer, seed)
    case 'compare':
      return buildCompareReply(club, period, snapshot, opts.previousSnapshot, opener, closer, seed)
    case 'fitcity':
      return buildFitcityReply(club, period, snapshot, opener, closer, seed)
    case 'finance':
      return buildFinanceReply(club, period, snapshot, opener, closer, seed)
    case 'pnk':
      return buildPnkReply(club, period, snapshot, opener, closer, seed)
    case 'bestday':
      return buildBestDayReply(club, period, snapshot, opener, closer, seed)
    default:
      return null
  }
}

function buildPlanReply(club, period, snapshot, opener, closer, seed) {
  const profit = Number(snapshot.sales?.profit_total) || 0
  const plan = Number(snapshot.sales?.plan_total) || 0
  const pct = Number(snapshot.sales?.plan_progress_pct) || 0
  const coverage = Number(snapshot.sales?.report_coverage_pct) || 0
  const days = Number(snapshot.sales?.days_with_reports) || 0
  const achieved = Number(snapshot.sales?.achieved_plan_level) || 0

  if (plan <= 0) {
    return `${club}, ${period}: ${opener}, план продаж на месяц не задан — сверь с менеджером. Отчётов ${days} дней, база ${coverage}%. ${closer}.`
  }

  const tone =
    pct >= 90
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : pct >= 55
        ? 'идём нормально'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)
  const push = pct < 70 ? ` ${pickWord(GEMINI_LEXICON_POOLS.push, seed + 1)}.` : ''
  const levelLine =
    achieved > 0 ? ` Закрыли порог уровня ${achieved}.` : ' Финальный порог ещё не закрыт.'

  return `${club}, ${period}: ${opener}, план ${pct}% — ${formatRub(profit)} из ${formatRub(plan)}, ${tone}.${levelLine} Отчётов ${days} дней (${coverage}%).${push} ${closer}.`
}

function buildGapReply(club, period, snapshot, opener, closer, seed) {
  const issues = []
  const coverage = Number(snapshot.sales?.report_coverage_pct) || 0
  const planPct = Number(snapshot.sales?.plan_progress_pct) || 0
  const planTotal = Number(snapshot.sales?.plan_total) || 0
  const gap = Number(snapshot.trainings?.gap_manager_minus_fit_city) || 0
  const inactive = Number(snapshot.operations?.inactive_clients_in_period) || 0
  const profitTotal = Number(snapshot.sales?.profit_total) || 0
  const profitNk = Number(snapshot.sales?.profit_nk) || 0
  const profitDk = Number(snapshot.sales?.profit_dk) || 0

  if (coverage < 35) issues.push({ w: 100 - coverage, text: `база отчётов ${coverage}% — цифры сырые` })
  if (planTotal > 0 && planPct < 50) issues.push({ w: 50 - planPct, text: `план продаж ${planPct}% — просадка` })
  if (gap > 5) issues.push({ w: gap, text: `расхождение отчёт/FIT-CITY ${gap} тренировок` })
  if (inactive >= 5) issues.push({ w: inactive, text: `${inactive} неактивных клиентов в периоде` })
  if (profitTotal > 0 && profitNk / profitTotal < 0.15 && profitDk / profitTotal > 0.55) {
    issues.push({ w: 30, text: 'слабая доля НК при опоре на ДК — просадка по новым' })
  }

  if (!issues.length) {
    return `${club}, ${period}: ${opener}, явных дыр нет — ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}, держим темп. ${closer}.`
  }

  issues.sort((a, b) => b.w - a.w)
  const main = issues[0].text
  const second = issues[1]?.text
  const tail = second ? ` Ещё: ${second}.` : ''
  return `${club}, ${period}: ${opener}, главный косяк — ${main}.${tail} ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
}

function buildCompareReply(club, period, snapshot, previousSnapshot, opener, closer, seed) {
  if (!previousSnapshot) {
    return `${club}, ${period}: ${opener}, прошлый месяц не подгрузился — спроси ещё раз или проверь отчёты. ${closer}.`
  }

  const curProfit = Number(snapshot.sales?.profit_total) || 0
  const prevProfit = Number(previousSnapshot.sales?.profit_total) || 0
  const curPlan = Number(snapshot.sales?.plan_progress_pct) || 0
  const prevPlan = Number(previousSnapshot.sales?.plan_progress_pct) || 0
  const prevLabel = previousSnapshot.period?.label || 'прошлый месяц'
  const delta = curProfit - prevProfit
  const deltaPct =
    prevProfit > 0 ? Math.round((delta / prevProfit) * 1000) / 10 : curProfit > 0 ? 100 : 0

  let profitLine
  if (delta > 0) {
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}: +${formatRub(delta)} (${deltaPct > 0 ? '+' : ''}${deltaPct}%) к ${prevLabel}`
  } else if (delta < 0) {
    profitLine = `выручка ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}: ${formatRub(delta)} (${deltaPct}%) к ${prevLabel}`
  } else {
    profitLine = `выручка как в ${prevLabel} — ${formatRub(curProfit)}`
  }

  let planLine = ''
  if (curPlan !== prevPlan) {
    planLine =
      curPlan > prevPlan
        ? ` План ${curPlan}% против ${prevPlan}% — лучше.`
        : ` План ${curPlan}% против ${prevPlan}% — хуже.`
  }

  return `${club}, ${period}: ${opener}, ${profitLine}.${planLine} ${closer}.`
}

function buildFitcityReply(club, period, snapshot, opener, closer, seed) {
  const manager = Number(snapshot.trainings?.manager_report_total) || 0
  const fitCity = Number(snapshot.trainings?.fit_city_tablets_only) || 0
  const gap = Number(snapshot.trainings?.gap_manager_minus_fit_city) || 0

  if (manager <= 0 && fitCity <= 0) {
    return `${club}, ${period}: ${opener}, в отчёте и FIT-CITY пусто — база не забита. ${closer}.`
  }

  if (gap === 0) {
    return `${club}, ${period}: ${opener}, отчёт и FIT-CITY совпали — ${manager} тренировок, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
  }

  if (gap > 0) {
    return `${club}, ${period}: ${opener}, в отчёте ${manager}, на планшетах ${fitCity} — разница ${gap}, это норма если часть зала без планшета. Сверь с менеджером. ${closer}.`
  }

  return `${club}, ${period}: ${opener}, FIT-CITY (${fitCity}) больше отчёта (${manager}) — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}, догони дневные отчёты. ${closer}.`
}

function buildFinanceReply(club, period, snapshot, opener, closer, seed) {
  const finance = snapshot.finance
  if (!finance) {
    return `${club}, ${period}: ${opener}, финансы (ФОТ/расход) в этом запросе не переданы — включи блок финансов или спроси иначе. ${closer}.`
  }

  const net = Number(finance.net_profit) || 0
  const payroll = Number(finance.trainer_payroll) || 0
  const gross = Number(finance.gross_before_expense ?? snapshot.sales?.profit_total) || 0
  const payrollShare = gross > 0 ? Math.round((payroll / gross) * 1000) / 10 : 0

  if (net < 0) {
    return `${club}, ${period}: ${opener}, чистая ${formatRub(net)} — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}, ФОТ ${formatRub(payroll)} (${payrollShare}% от валовой). ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
  }

  const tone =
    payrollShare <= 35
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : payrollShare <= 45
        ? 'терпимо'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)

  return `${club}, ${period}: ${opener}, чистая ${formatRub(net)}, ФОТ ${formatRub(payroll)} (${payrollShare}% от ${formatRub(gross)}) — ${tone}. ${closer}.`
}

function formatDayRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(iso ?? '').trim() || '—'
  return `${Number(m[3])}.${Number(m[2])}`
}

function buildPnkReply(club, period, snapshot, opener, closer, seed) {
  const pnk = Number(snapshot.sales?.pnk_total) || 0
  const days = Number(snapshot.sales?.days_with_reports) || 0
  const coverage = Number(snapshot.sales?.report_coverage_pct) || 0

  if (days <= 0) {
    return `${club}, ${period}: ${opener}, отчётов нет — ПНК не считаю. ${closer}.`
  }

  const tone = pnk >= 20 ? pickWord(GEMINI_LEXICON_POOLS.praise, seed) : pnk >= 8 ? 'норм поток' : pickWord(GEMINI_LEXICON_POOLS.critique, seed)
  return `${club}, ${period}: ${opener}, ПНК за месяц ${pnk} шт — ${tone}. База отчётов ${coverage}%. ${closer}.`
}

function buildBestDayReply(club, period, snapshot, opener, closer, seed) {
  const highlights = snapshot.sales?.profit_day_highlights
  const best = highlights?.best_day
  if (!best?.date) {
    return `${club}, ${period}: ${opener}, нет дней с отчётом — лучший день не определить. ${closer}.`
  }

  const dayLabel = formatDayRu(best.date)
  const amount = formatRub(Number(best.profit) || 0)
  return `${club}, ${period}: ${opener}, лучший день ${dayLabel} — ${amount}, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
}
