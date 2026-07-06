/** Мгновенные ответы на chips — без вызова Gemini, только готовые insights из snapshot. */

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
    label: 'ЗП и маржа',
    message: 'ЗП залов и чистая прибыль — норм или давит?',
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

function toneWord(tone, seed, pools) {
  if (tone === 'strong') return pickWord(pools.praise, seed)
  if (tone === 'ok') return 'норм поток'
  return pickWord(pools.critique, seed)
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
    default:
      return null
  }
}

function buildPlanReply(club, period, snapshot, insights, opener, closer, seed) {
  const planInsight = insights.plan ?? {}
  const report = insights.report ?? {}
  const profit = Number(planInsight.profit_total ?? snapshot.sales?.profit_total) || 0
  const plan = Number(planInsight.plan_total ?? snapshot.sales?.plan_total) || 0
  const pct = Number(planInsight.pct ?? snapshot.sales?.plan_progress_pct) || 0
  const coverage = Number(report.coverage_pct ?? snapshot.sales?.report_coverage_pct) || 0
  const days = Number(report.days_with_reports ?? snapshot.sales?.days_with_reports) || 0
  const achieved = Number(planInsight.achieved_level ?? snapshot.sales?.achieved_plan_level) || 0

  if (!planInsight.has_plan && plan <= 0) {
    return `${club}, ${period}: ${opener}, план продаж на месяц не задан — сверь с менеджером. Отчётов ${days} дней, база ${coverage}%. ${closer}.`
  }

  const tone =
    planInsight.tone === 'strong'
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : planInsight.tone === 'ok'
        ? 'идём нормально'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)
  const push = planInsight.tone === 'weak' ? ` ${pickWord(GEMINI_LEXICON_POOLS.push, seed + 1)}.` : ''
  const levelLine =
    achieved > 0 ? ` Закрыли порог уровня ${achieved}.` : ' Финальный порог ещё не закрыт.'

  return `${club}, ${period}: ${opener}, план ${pct}% — ${formatRub(profit)} из ${formatRub(plan)}, ${tone}.${levelLine} Отчётов ${days} дней (${coverage}%).${push} ${closer}.`
}

function buildGapReply(club, period, insights, opener, closer, seed) {
  const issues = insights.issues ?? []
  if (!issues.length) {
    return `${club}, ${period}: ${opener}, явных дыр нет — ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}, держим темп. ${closer}.`
  }

  const main = issues[0].text
  const second = issues[1]?.text
  const tail = second ? ` Ещё: ${second}.` : ''
  return `${club}, ${period}: ${opener}, главный косяк — ${main}.${tail} ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
}

function buildCompareReply(club, period, insights, opener, closer, seed) {
  const mom = insights.mom_comparison
  if (!mom) {
    return `${club}, ${period}: ${opener}, прошлый месяц не подгрузился — спроси ещё раз или проверь отчёты. ${closer}.`
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
    profitLine = `выручка как в ${prevLabel} — ${formatRub(curProfit)}`
  }

  let planLine = ''
  if (mom.plan_direction === 'up') {
    planLine = ` План ${mom.plan_pct_current}% против ${mom.plan_pct_previous}% — лучше.`
  } else if (mom.plan_direction === 'down') {
    planLine = ` План ${mom.plan_pct_current}% против ${mom.plan_pct_previous}% — хуже.`
  }

  return `${club}, ${period}: ${opener}, ${profitLine}.${planLine} ${closer}.`
}

function buildFitcityReply(club, period, insights, opener, closer, seed) {
  const fc = insights.fitcity ?? {}
  const manager = Number(fc.manager_total) || 0
  const fitCity = Number(fc.fit_city_total) || 0
  const gap = Number(fc.gap) || 0

  if (fc.status === 'empty') {
    return `${club}, ${period}: ${opener}, в отчёте и FIT-CITY пусто — база не забита. ${closer}.`
  }
  if (fc.status === 'aligned') {
    return `${club}, ${period}: ${opener}, отчёт и FIT-CITY совпали — ${manager} тренировок, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
  }
  if (fc.status === 'manager_higher') {
    return `${club}, ${period}: ${opener}, в отчёте ${manager}, на планшетах ${fitCity} — разница ${gap}, это норма если часть зала без планшета. Сверь с менеджером. ${closer}.`
  }
  return `${club}, ${period}: ${opener}, FIT-CITY (${fitCity}) больше отчёта (${manager}) — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}, догони дневные отчёты. ${closer}.`
}

function buildFinanceReply(club, period, insights, opener, closer, seed) {
  const fin = insights.finance
  if (!fin) {
    return `${club}, ${period}: ${opener}, финансы (ЗП/расход) в этом запросе не переданы — включи блок финансов или спроси иначе. ${closer}.`
  }

  const net = Number(fin.net_profit) || 0
  const payroll = Number(fin.trainer_payroll) || 0
  const payrollShare = Number(fin.payroll_share_pct) || 0

  if (fin.margin_tone === 'negative') {
    return `${club}, ${period}: ${opener}, чистая ${formatRub(net)} — ${pickWord(GEMINI_LEXICON_POOLS.critique, seed)}, ЗП персонального зала ${formatRub(payroll)} (${payrollShare}% от валовой). ${pickWord(GEMINI_LEXICON_POOLS.push, seed)}. ${closer}.`
  }

  const tone =
    fin.margin_tone === 'strong'
      ? pickWord(GEMINI_LEXICON_POOLS.praise, seed)
      : fin.margin_tone === 'ok'
        ? 'терпимо'
        : pickWord(GEMINI_LEXICON_POOLS.critique, seed)

  return `${club}, ${period}: ${opener}, чистая ${formatRub(net)}, ЗП персонального зала ${formatRub(payroll)} (${payrollShare}% от ${formatRub(fin.gross)}) — ${tone}. ${closer}.`
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
    return `${club}, ${period}: ${opener}, отчётов нет — ПНК не считаю. ${closer}.`
  }

  const tone = toneWord(pnkInsight.tone, seed, GEMINI_LEXICON_POOLS)
  return `${club}, ${period}: ${opener}, ПНК за месяц ${pnk} шт — ${tone}. База отчётов ${coverage}%. ${closer}.`
}

function buildBestDayReply(club, period, snapshot, insights, opener, closer, seed) {
  const best =
    insights.highlights?.best_day ?? snapshot.sales?.profit_day_highlights?.best_day
  if (!best?.date) {
    return `${club}, ${period}: ${opener}, нет дней с отчётом — лучший день не определить. ${closer}.`
  }

  const dayLabel = formatDayRu(best.date)
  const amount = formatRub(Number(best.profit) || 0)
  return `${club}, ${period}: ${opener}, лучший день ${dayLabel} — ${amount}, ${pickWord(GEMINI_LEXICON_POOLS.praise, seed)}. ${closer}.`
}
