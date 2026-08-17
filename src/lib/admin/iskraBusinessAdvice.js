/**
 * Бизнес-советы ИСКРЫ из готовых insights snapshot — без Gemini.
 * Расширяемый реестр правил: новая карточка = новая функция + verify.
 */

import { resolveIskraAdvisorRole, iskraAdvisorHasCapability, iskraAdvisorFullAccess } from './iskraAdvisorRoles.js'
import { iskraReplyHeader, joinIskraReply } from './iskraReplyCompact.js'
import { formatRubCompact } from './iskraReplyPhrasing.js'

/**
 * @typedef {{
 *   id: string,
 *   priority: number,
 *   topic: string,
 *   headline: string,
 *   action: string,
 *   evidence: string,
 *   roleIds: string[],
 * }} IskraAdviceCard
 */

function normalizeAdviceText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

/** @param {IskraAdviceCard} card @param {string} [advisorRoleId] */
export function isAdviceCardVisibleForRole(card, advisorRoleId) {
  if (iskraAdvisorFullAccess(advisorRoleId)) return true
  const role = resolveIskraAdvisorRole(advisorRoleId)
  if (!card.roleIds?.length) return true
  if (!card.roleIds.includes(role.id)) return false
  if (card.topic === 'finance' && !iskraAdvisorHasCapability(role, 'finance')) return false
  if (card.topic === 'trainers' && !iskraAdvisorHasCapability(role, 'trainers')) return false
  if (card.topic === 'sales' && !iskraAdvisorHasCapability(role, 'plan')) return false
  return true
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, limit?: number }} [opts]
 * @returns {IskraAdviceCard[]}
 */
export function buildIskraAdviceCards(snapshot, opts = {}) {
  if (!snapshot?.insights) return []
  const advisorRoleId = opts.advisorRoleId ?? 'app_admin'
  const insights = snapshot.insights
  const cal = snapshot.calendar_context
  const cards = []

  const plan = insights.plan ?? {}
  const planPct = Number(plan.pct) || 0
  const vsCalendar = plan.calendar_vs_plan
  const planTone = plan.tone

  if (plan.has_plan && (vsCalendar === 'behind' || planTone === 'weak')) {
    const expected = plan.calendar_expected_pct
    const evidence =
      expected != null
        ? `План ${String(planPct).replace('.', ',')}%, норма к дате ${String(expected).replace('.', ',')}%`
        : `План ${String(planPct).replace('.', ',')}%`
    cards.push({
      id: 'plan_behind_calendar',
      priority: 92,
      topic: 'sales',
      headline: 'План отстаёт от календарного темпа',
      action: 'На оставшиеся дни — ежедневный контроль ПЗ и НК, разбор отстающих направлений с менеджерами',
      evidence,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  const dir = insights.direction_plan ?? {}
  const worst = dir.worst
  if (dir.has_direction_plans && worst) {
    cards.push({
      id: 'direction_lag',
      priority: 85,
      topic: 'sales',
      headline: `Отставание по ${worst.label}`,
      action: `Сфокусировать отдел на ${worst.label}: план-факт по дням, мотивация и акции на слабое направление`,
      evidence: `${worst.label} ${String(worst.pct).replace('.', ',')}%`,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  const structure = insights.structure ?? {}
  if (structure.weak_nk_vs_dk) {
    cards.push({
      id: 'weak_nk_share',
      priority: 78,
      topic: 'sales',
      headline: 'Слабая доля НК при опоре на ДК',
      action: 'Усилить продажи новым клиентам: скрипты НК, встречи с менеджерами, контроль конверсии в зале',
      evidence: `НК ${String(structure.nk_share_pct ?? 0).replace('.', ',')}% выручки`,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  const pnk = insights.pnk ?? {}
  if (pnk.tone === 'weak' && (Number(pnk.total) || 0) >= 0) {
    cards.push({
      id: 'low_pnk',
      priority: 72,
      topic: 'sales',
      headline: 'Мало ПНК за месяц',
      action: 'Запустить акцию ПНК: цель на неделю, отчёт по каждому менеджеру, разбор лучших практик',
      evidence: `ПНК ${Number(pnk.total) || 0}`,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  const cf = snapshot.club_finance
  if (cf?.available && cf.forecast && !cf.forecast.will_reach_plan) {
    const shortfall = Number(cf.forecast.shortfall_rub) || 0
    cards.push({
      id: 'forecast_shortfall',
      priority: 88,
      topic: 'finance',
      headline: 'Прогноз не дотянет план',
      action:
        shortfall > 0
          ? `Закрыть разрыв ${formatRubCompact(shortfall)}: усилить слабые дни и направления до конца месяца`
          : 'Пересмотреть темп продаж: прогноз ниже плана — срочный план на оставшиеся дни',
      evidence: `Прогноз ${String(cf.forecast.plan_pct ?? 0).replace('.', ',')}%`,
      roleIds: ['app_admin', 'curator'],
    })
  }

  const finance = insights.finance
  if (finance?.net_profit_margin_tone === 'weak' && finance?.net_profit_margin_pct != null) {
    cards.push({
      id: 'low_net_profit_margin',
      priority: 82,
      topic: 'finance',
      headline:
        Number(finance.net_profit_margin_pct) < 0
          ? 'Клуб в минусе по чистой'
          : 'Рентабельность по валу просела',
      action:
        Number(finance.net_profit_margin_pct) < 0
          ? 'Срочно: возвраты, ЗП и расход против вала — сверить неделю и план до конца месяца'
          : 'Сверить возвраты, ЗП зала и расход: рентабельность ниже 15% — дожать допродажи или снять давление затрат',
      evidence: `Рент-ть ${String(finance.net_profit_margin_pct).replace('.', ',')}% (${finance.net_profit_margin_label_ru ?? 'риск'})`,
      roleIds: ['app_admin', 'curator'],
    })
  }
  if (finance?.margin_tone === 'weak' || finance?.margin_tone === 'negative') {
    cards.push({
      id: 'payroll_pressure',
      priority: 80,
      topic: 'finance',
      headline: 'ЗП зала давит на маржу',
      action: 'Сверить нагрузку зала и выручку: перераспределить смены, проверить возвраты и допродажи',
      evidence: `Доля ЗП ${String(finance.payroll_share_pct ?? 0).replace('.', ',')}%`,
      roleIds: ['app_admin', 'curator'],
    })
  }

  const fitcity = insights.fitcity ?? {}
  if (fitcity.status === 'manager_higher' && (Number(fitcity.gap) || 0) >= 3) {
    cards.push({
      id: 'fitcity_gap',
      priority: 65,
      topic: 'trainers',
      headline: 'Разрыв отчёта менеджера и планшетов',
      action: 'Сверить тренировки: дожать ввод «Без типа» и завершение на планшетах — иначе ЗП и статистика расходятся',
      evidence: `Разница ${Number(fitcity.gap) || 0} тренировок`,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  const topIssue = insights.top_issue
  if (topIssue?.id === 'inactive_clients') {
    cards.push({
      id: 'inactive_clients',
      priority: 70,
      topic: 'trainers',
      headline: 'Много неактивных клиентов',
      action: 'План реактивации: список неактивных, звонки тренеров, цель по возвратам на неделю',
      evidence: topIssue.text,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  } else if (topIssue && topIssue.id !== 'inactive_clients') {
    cards.push({
      id: `issue_${topIssue.id}`,
      priority: 68,
      topic: 'sales',
      headline: 'Главное отклонение месяца',
      action: 'Разобрать с командой на планёрке и зафиксировать меры на 3–5 дней',
      evidence: topIssue.text,
      roleIds: ['app_admin', 'club_supervisor', 'curator'],
    })
  }

  if (cal?.month_relation === 'current') {
    const reportDays = Number(insights.report?.days_with_reports) || 0
    if (reportDays === 0) {
      cards.push({
        id: 'report_today',
        priority: 55,
        topic: 'sales',
        headline: 'Нет свежего отчёта за сегодня',
        action: 'Попросить менеджера внести отчёт вечером — без него прогноз и советы по плану слепые',
        evidence: 'Отчёт за сегодня не в базе',
        roleIds: ['app_admin', 'club_supervisor', 'curator'],
      })
    }
  }

  const visible = cards.filter((c) => isAdviceCardVisibleForRole(c, advisorRoleId))
  visible.sort((a, b) => b.priority - a.priority)
  const limit = Math.max(1, Number(opts.limit) || 12)
  return visible.slice(0, limit)
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, limit?: number }} [opts]
 */
export function buildIskraAdviceSummary(snapshot, opts = {}) {
  const cards = buildIskraAdviceCards(snapshot, { ...opts, limit: opts.limit ?? 3 })
  return {
    advisor_role_id: opts.advisorRoleId ?? 'app_admin',
    cards: cards.map((c) => ({
      id: c.id,
      headline: c.headline,
      action: c.action,
      evidence: c.evidence,
      priority: c.priority,
    })),
    has_actionable: cards.length > 0,
  }
}

/**
 * @param {string} userMessage
 * @returns {'advice'|'advice_plan'|null}
 */
export function matchIskraAdviceIntent(userMessage) {
  const s = normalizeAdviceText(userMessage)
  if (!s) return null
  if (/как\s+дожать|дотянуть\s+план|как\s+выполнить\s+план|как\s+закрыть\s+план/.test(s)) {
    return 'advice_plan'
  }
  if (
    /что\s+делать|что\s+сделать|совет|рекомендац|как\s+улучш|как\s+подтянуть|план\s+действ|меры|шаги/.test(
      s,
    )
  ) {
    return 'advice'
  }
  return null
}

/**
 * @param {object | null | undefined} snapshot
 * @param {{ advisorRoleId?: string, club?: string, period?: string, focus?: 'general'|'plan' }} [opts]
 */
export function buildIskraAdviceReply(snapshot, opts = {}) {
  const club = String(opts.club ?? snapshot?.club_name ?? 'клуб').trim()
  const period =
    String(opts.period ?? '').trim() ||
    String(snapshot?.period?.label ?? '').trim() ||
    'месяц'
  const focus = opts.focus === 'plan' ? 'plan' : 'general'
  const cards = buildIskraAdviceCards(snapshot, {
    advisorRoleId: opts.advisorRoleId,
    limit: focus === 'plan' ? 2 : 3,
  })

  const planCards = cards.filter((c) =>
    ['plan_behind_calendar', 'direction_lag', 'forecast_shortfall', 'weak_nk_share'].includes(c.id),
  )
  const picked = (focus === 'plan' && planCards.length ? planCards : cards).slice(0, focus === 'plan' ? 2 : 2)

  if (!picked.length) {
    return joinIskraReply(
      iskraReplyHeader(club, period),
      'Критичных точек нет — держите темп и контролируйте план по дням.',
    )
  }

  const lines = picked.map((c, i) => {
    if (i === 0) return `${c.action} (${c.evidence}).`
    return c.action
  })

  return joinIskraReply(iskraReplyHeader(club, period), lines.join(' '))
}
