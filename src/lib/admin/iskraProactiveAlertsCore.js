/**
 * Проактивные алерты ИСКРЫ — триггеры без вопроса (admin).
 */

/**
 * @param {object | null | undefined} snapshot
 * @param {object | null | undefined} [kpi]
 * @returns {Array<{ id: string, severity: 'warn'|'accent'|'ok', title: string, message: string, handlerId?: string, ctaMessage?: string }>}
 */
export function buildIskraProactiveAlerts(snapshot, kpi) {
  if (!snapshot) return []
  const alerts = []
  const insights = snapshot.insights ?? {}
  const plan = insights.plan ?? {}
  const planPct = Number(kpi?.planPct ?? kpi?.plan_progress_pct ?? plan.pct) || 0
  const reportDays = Number(kpi?.report_days ?? kpi?.reportDays ?? snapshot.sales?.days_with_reports) || 0
  const coverage = Number(snapshot.sales?.report_coverage_pct)
  const cal = snapshot.calendar_context ?? {}
  const phase = String(cal.month_relation ?? cal.phase ?? '').toLowerCase()
  const midOrLate = phase.includes('mid') || phase.includes('late') || phase.includes('конец')

  if (plan.has_plan !== false && (planPct < 40 || (plan.calendar_vs_plan === 'behind' && planPct < 55))) {
    alerts.push({
      id: 'plan_critical',
      severity: 'warn',
      title: `План ${String(planPct).replace('.', ',')}% — критично`,
      message: 'Отставание от календарного темпа. Спросите план действий или нажмите «Что делать».',
      handlerId: 'advice_plan',
      ctaMessage: 'Как дожать план до конца месяца?',
    })
  }

  if (reportDays === 0) {
    alerts.push({
      id: 'no_reports',
      severity: 'warn',
      title: 'Нет дневных отчётов',
      message: 'Без отчётов менеджера цифры предварительные — уточните покрытие месяца.',
      handlerId: 'gap',
      ctaMessage: 'Насколько заполнена база дневных отчётов менеджера за месяц?',
    })
  } else if (Number.isFinite(coverage) && coverage < 35 && midOrLate) {
    alerts.push({
      id: 'low_coverage',
      severity: 'accent',
      title: `Покрытие отчётов ${String(coverage).replace('.', ',')}%`,
      message: 'Много дней без отчёта — прогноз и план менее надёжны.',
      handlerId: 'gap',
      ctaMessage: 'Какие главные риски и отклонения в цифрах за месяц?',
    })
  }

  const cf = snapshot.club_finance
  if (cf?.available && cf.forecast?.will_reach_plan === false && cf.forecast?.plan_pct != null) {
    alerts.push({
      id: 'forecast_miss',
      severity: 'warn',
      title: `Прогноз плана ${String(cf.forecast.plan_pct).replace('.', ',')}%`,
      message: 'При текущем темпе план может не закрыться — нужны точечные действия.',
      handlerId: 'month_forecast',
      ctaMessage: 'Какой прогноз на месяц по выручке, плану и чистой прибыли?',
    })
  }

  const topIssue = insights.top_issue
  const inactiveRoll = Number(snapshot.trainer_contour?.club_roll_up?.inactive_clients_holders) || 0
  if (topIssue?.id === 'inactive_clients' || inactiveRoll >= 5) {
    alerts.push({
      id: 'inactive_spike',
      severity: 'accent',
      title: inactiveRoll > 0 ? `Неактивных: ${inactiveRoll}` : 'Всплеск неактивных',
      message: topIssue?.label ?? 'Клиенты без абонемента — риск оттока выручки.',
      handlerId: 'trainer_inactive',
      ctaMessage: 'Кто неактивные клиенты и что с ними делать?',
    })
  }

  const seen = new Set()
  return alerts
    .filter((a) => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    .slice(0, 4)
}
