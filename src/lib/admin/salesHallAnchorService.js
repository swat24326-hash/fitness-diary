/**
 * Загрузка данных для вкладки «Стратегия»: якорь прошлого месяца + план целевого.
 */

import { todayLocalIso } from '../dateRu.js'
import { fetchClubSalesBundle } from './adminSalesService.js'
import { lastDayIsoOfMonth } from './salesPlanPzDkSuggestCore.js'
import {
  buildHallAnchorProjection,
  previousCalendarYearMonth,
} from './salesHallAnchorCore.js'
import { calendarYearMonthFromIso } from './salesPlanPzDkSuggestCore.js'
import { resolveTargetPlanMonthForHorizon } from './salesPlanPzDkSuggestCore.js'
import {
  fingerprintPlanDraft,
  readSalesDraft,
  resolvePlanDraftAfterLoad,
  salesPlanDraftKey,
} from './adminSalesDraftStorage.js'
import { planRowToForm, resolvePlanFinalTarget } from './salesReportCore.js'
import { hydrateStrategyFromPlanRow } from './salesStrategySnapshotCore.js'

/**
 * @param {{
 *   clubId: string,
 *   horizon?: 'current' | 'next',
 *   todayIso?: string,
 * }} opts
 */
export async function loadSalesStrategyAnchor(opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  if (!clubId) return { ok: false, error: 'Не выбран клуб' }

  const todayIso = opts?.todayIso || todayLocalIso()
  const horizon = opts?.horizon === 'next' ? 'next' : 'current'
  const target = resolveTargetPlanMonthForHorizon(horizon, todayIso)
  if (!target) return { ok: false, error: 'Не удалось определить месяц плана' }

  const baseYm = previousCalendarYearMonth(target.year, target.month)
  if (!baseYm) return { ok: false, error: 'Некорректный месяц базы' }

  const baseDate = lastDayIsoOfMonth(baseYm.year, baseYm.month)
  const planDate = `${target.year}-${String(target.month).padStart(2, '0')}-01`
  if (!baseDate) return { ok: false, error: 'Нет даты среза базы' }

  const [baseBundle, planBundle] = await Promise.all([
    fetchClubSalesBundle({ clubId, reportDate: baseDate, profile: 'month' }),
    // current: дни месяца плана (playbook); next: shell достаточно
    fetchClubSalesBundle({
      clubId,
      reportDate: planDate,
      profile: horizon === 'current' ? 'month' : 'shell',
    }),
  ])

  const projection = buildHallAnchorProjection({
    baseRows: baseBundle?.monthDays ?? [],
    baseYear: baseYm.year,
    baseMonth: baseYm.month,
    planYear: target.year,
    planMonth: target.month,
  })

  if (!projection.ok) {
    return { ok: false, error: projection.error || 'Не удалось посчитать якорь', horizon, target, baseYm }
  }

  let planForm = planRowToForm(planBundle?.plan)
  // Тот же черновик «План месяца», что видит шапка — иначе ур. 3 «не задан» при несохранённом плане.
  const planServerFp = fingerprintPlanDraft(planForm)
  const planDraft = readSalesDraft(salesPlanDraftKey(clubId, target.year, target.month))
  planForm = resolvePlanDraftAfterLoad({
    draft: planDraft,
    serverFp: planServerFp,
    planForm,
  }).planForm

  const planLevel3 = resolvePlanFinalTarget({
    plan_level_1: Number(planForm.plan_level_1) || 0,
    plan_level_2: Number(planForm.plan_level_2) || 0,
    plan_level_3: Number(planForm.plan_level_3) || 0,
  })

  const strategyHydrated = hydrateStrategyFromPlanRow(planBundle?.plan)
  const strategySnapshot =
    strategyHydrated.ok &&
    strategyHydrated.snapshot?.year === target.year &&
    strategyHydrated.snapshot?.month === target.month
      ? strategyHydrated
      : null

  return {
    ok: true,
    horizon,
    target,
    baseYm,
    todayIso,
    todayYm: calendarYearMonthFromIso(todayIso),
    projection,
    planForm,
    planLevel3: planLevel3 > 0 ? planLevel3 : 0,
    planMonthDays: planBundle?.monthDays ?? [],
    /** Дни прошлого месяца (база якоря) — доли НК/ДК/УК для добора плана. */
    prevMonthDays: baseBundle?.monthDays ?? [],
    membershipTypes: planBundle?.membershipTypes ?? baseBundle?.membershipTypes ?? [],
    /** Снимок playbook с галочками (если сохраняли после «Посчитать»). */
    strategySnapshot,
  }
}
