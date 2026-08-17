/**
 * Оценка эффекта советов ИСКРЫ в ₽ — для action cards North Star.
 */

import { buildIskraAdviceCards } from './iskraBusinessAdvice.js'
import { formatRubCompact } from './iskraReplyPhrasing.js'

/** @typedef {import('./iskraBusinessAdvice.js').IskraAdviceCard} IskraAdviceCard */

/** @type {Record<string, { handlerId: string, message: string, label?: string }>} */
export const ISKRA_ADVICE_DO_ACTIONS = {
  plan_behind_calendar: {
    handlerId: 'advice_plan',
    message: 'Как дожать план до конца месяца?',
    label: 'План действий',
  },
  direction_lag: {
    handlerId: 'advice_plan',
    message: 'Что делать с отстающим направлением продаж?',
    label: 'Направление',
  },
  forecast_shortfall: {
    handlerId: 'month_forecast',
    message: 'Какой прогноз чистой прибыли по текущему темпу?',
    label: 'Прогноз',
  },
  weak_nk_share: {
    handlerId: 'sales_structure',
    message: 'Как устроены продажи НК, ДК и УК за месяц?',
    label: 'Структура',
  },
  low_pnk: {
    handlerId: 'advice',
    message: 'Что сделать, чтобы усилить ПНК в этом месяце?',
    label: 'ПНК',
  },
  payroll_pressure: {
    handlerId: 'finance',
    message: 'Как устроена чистая прибыль и маржа клуба за месяц?',
    label: 'Финансы',
  },
  low_net_profit_margin: {
    handlerId: 'finance',
    message: 'Как устроена чистая прибыль и маржа клуба за месяц?',
    label: 'Маржа',
  },
  fitcity_gap: {
    handlerId: 'gap',
    message: 'Насколько отчёт менеджера совпадает с планшетами?',
    label: 'Сверка',
  },
  inactive_clients: {
    handlerId: 'trainer_inactive',
    message: 'Кто неактивные клиенты и что с ними делать?',
    label: 'Реактивация',
  },
  report_today: {
    handlerId: 'plan',
    message: 'Насколько заполнена база дневных отчётов менеджера за месяц?',
    label: 'Отчёты',
  },
}

/**
 * @param {string} cardId
 * @param {object | null | undefined} snapshot
 * @returns {number | null}
 */
export function estimateAdviceImpactRub(cardId, snapshot) {
  if (!snapshot) return null
  const sales = snapshot.sales ?? {}
  const insights = snapshot.insights ?? {}
  const planTotal = Number(sales.plan_total) || 0
  const profitTotal = Number(sales.profit_total) || 0
  const cf = snapshot.club_finance

  switch (cardId) {
    case 'forecast_shortfall': {
      const v = Number(cf?.forecast?.shortfall_rub) || 0
      return v > 0 ? Math.round(v) : null
    }
    case 'plan_behind_calendar': {
      const expected = Number(insights.plan?.calendar_expected_pct) || 0
      const pct = Number(insights.plan?.pct ?? sales.plan_progress_pct) || 0
      if (planTotal > 0 && expected > pct) {
        return Math.round((planTotal * (expected - pct)) / 100)
      }
      return null
    }
    case 'direction_lag': {
      const worst = insights.direction_plan?.worst
      if (!worst || !planTotal) return null
      const gap = Math.max(0, 100 - (Number(worst.pct) || 0))
      const share = 0.25
      return gap > 0 ? Math.round((planTotal * share * gap) / 100) : null
    }
    case 'inactive_clients': {
      const top = insights.top_issue
      const match = String(top?.text ?? '').match(/(\d+)/)
      const n = match ? Number(match[1]) : Number(snapshot.inactive_in_period) || 0
      if (n <= 0) return null
      const avgTicket = planTotal > 0 ? planTotal / Math.max(20, Number(insights.report?.days_in_month) || 30) : 12000
      return Math.round(n * avgTicket * 0.12)
    }
    case 'weak_nk_share': {
      if (!planTotal) return null
      const nkShare = Number(insights.structure?.nk_share_pct) || 0
      if (nkShare >= 25) return null
      return Math.round(planTotal * 0.08)
    }
    case 'low_pnk': {
      const pnk = Number(insights.pnk?.total) || 0
      if (pnk >= 5) return null
      return Math.round((5 - pnk) * 8000)
    }
    case 'payroll_pressure': {
      const margin = Number(insights.finance?.net_profit) || Number(cf?.net_profit) || 0
      if (margin <= 0) return null
      return Math.round(margin * 0.15)
    }
    case 'low_net_profit_margin': {
      const gross = Number(insights.finance?.gross) || Number(sales.profit_gross_total) || profitTotal
      if (gross <= 0) return null
      const net = Number(insights.finance?.net_profit) || 0
      const targetNet = gross * 0.2
      if (net >= targetNet) return null
      return Math.round(Math.max(0, targetNet - net))
    }
    case 'fitcity_gap': {
      const gap = Number(insights.fitcity?.gap) || 0
      if (gap <= 0) return null
      const perTraining = profitTotal > 0 && Number(sales.pz_trainings_from_manager_reports) > 0
        ? profitTotal / Number(sales.pz_trainings_from_manager_reports)
        : 2500
      return Math.round(gap * perTraining * 0.5)
    }
    default:
      if (planTotal > 0 && profitTotal > 0 && planTotal > profitTotal) {
        return Math.round(planTotal - profitTotal)
      }
      return null
  }
}

/**
 * @param {IskraAdviceCard} card
 * @param {object | null | undefined} snapshot
 */
export function enrichAdviceCardWithImpact(card, snapshot) {
  const impactRub = estimateAdviceImpactRub(card.id, snapshot)
  const doAction = ISKRA_ADVICE_DO_ACTIONS[card.id] ?? {
    handlerId: 'advice',
    message: 'Что сделать сейчас, чтобы улучшить результат месяца?',
    label: 'Сделать',
  }
  return {
    ...card,
    impactRub: impactRub != null && impactRub > 0 ? impactRub : null,
    impactLabel:
      impactRub != null && impactRub > 0 ? `≈ ${formatRubCompact(impactRub)} в игре` : null,
    doHandlerId: doAction.handlerId,
    doMessage: doAction.message,
    doLabel: doAction.label ?? 'Сделать',
    tone:
      card.priority >= 85 ? 'warn' : card.priority >= 70 ? 'accent' : 'neutral',
  }
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, limit?: number }} [opts]
 */
export function buildEnrichedIskraAdviceCards(snapshot, opts = {}) {
  const cards = buildIskraAdviceCards(snapshot, opts)
  return cards.map((c) => enrichAdviceCardWithImpact(c, snapshot))
}
