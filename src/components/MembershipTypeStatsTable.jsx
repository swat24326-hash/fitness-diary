import { useMemo } from 'react'
import { computePeriodPayrollForecastFromTypeStats } from '../lib/admin/trainerPeriodPayrollForecastCore.js'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { todayLocalIso } from '../lib/dateRu.js'

function typeKey(row) {
  return row?.typeId ?? '__none__'
}

const NONE_KEY = '__none__'

function formatScenariosLine(scenarios) {
  if (!scenarios) return null
  return `1: ${formatRub(scenarios.l1)} · 2: ${formatRub(scenarios.l2)} · 3: ${formatRub(scenarios.l3)}`
}

/**
 * Таблица: строки — тренеры, столбцы — типы карт, ячейки — количество.
 * Опционально — прогноз ЗП (база / итого + подсказка по плану).
 *
 * @param {{
 *   byType: object[],
 *   byTrainerByType: object[],
 *   trainerLabel: (id: string) => string,
 *   note?: string,
 *   showPayrollForecast?: boolean,
 *   membershipTypes?: object[],
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   asOfIso?: string,
 * }} props
 */
export function MembershipTypeStatsTable({
  byType = [],
  byTrainerByType = [],
  trainerLabel,
  note,
  showPayrollForecast = false,
  membershipTypes = [],
  planConfig = null,
  profilesByTrainerId = null,
  clubId = '',
  dateFrom = '',
  dateTo = '',
  asOfIso = '',
}) {
  const label = trainerLabel ?? ((id) => id || '—')

  const columns = useMemo(() => {
    const cols = []
    const seen = new Set()
    for (const row of byType) {
      const key = typeKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      cols.push({ typeId: key, code: row.code })
    }
    for (const tr of byTrainerByType) {
      for (const row of tr.byType ?? []) {
        const key = typeKey(row)
        if (seen.has(key)) continue
        seen.add(key)
        cols.push({ typeId: key, code: row.code })
      }
    }
    return cols
  }, [byType, byTrainerByType])

  const clubTotalTyped = useMemo(
    () => byType.filter((x) => typeKey(x) !== NONE_KEY).reduce((s, x) => s + (x.count ?? 0), 0),
    [byType],
  )

  const payrollForecast = useMemo(() => {
    if (!showPayrollForecast || !membershipTypes?.length) return null
    return computePeriodPayrollForecastFromTypeStats({
      byTrainerByType,
      membershipTypes,
      planConfig,
      profilesByTrainerId,
      clubId,
      dateFrom,
      dateTo,
      asOfIso: asOfIso || todayLocalIso(),
    })
  }, [
    showPayrollForecast,
    membershipTypes,
    byTrainerByType,
    planConfig,
    profilesByTrainerId,
    clubId,
    dateFrom,
    dateTo,
    asOfIso,
  ])

  if (!columns.length && !byTrainerByType.length) {
    return (
      <p className="muted mem-type-stats__empty">
        Нет завершённых тренировок и списаний за период.
      </p>
    )
  }

  const countForTrainer = (tr, colKey) => {
    const row = (tr.byType ?? []).find((x) => typeKey(x) === colKey)
    return row?.count ?? 0
  }

  const typedTotalForTrainer = (tr) => {
    const list = tr?.byType ?? []
    return list.filter((x) => typeKey(x) !== NONE_KEY).reduce((s, x) => s + (x.count ?? 0), 0)
  }

  const countForClub = (colKey) => {
    const row = byType.find((x) => typeKey(x) === colKey)
    return row?.count ?? 0
  }

  const renderPayCells = (trainerId) => {
    if (!payrollForecast) return null
    if (!trainerId) {
      return (
        <>
          <td className="admin-mem-type-table__num mem-type-stats__pay-col">
            <strong>{formatRub(payrollForecast.clubBaseRub)}</strong>
          </td>
          <td className="admin-mem-type-table__num mem-type-stats__pay-col">
            <strong>{formatRub(payrollForecast.clubTotalRub)}</strong>
          </td>
        </>
      )
    }
    const fc = payrollForecast.byTrainer.get(trainerId)
    if (!fc) {
      return (
        <>
          <td className="admin-mem-type-table__num mem-type-stats__pay-col">—</td>
          <td className="admin-mem-type-table__num mem-type-stats__pay-col">—</td>
        </>
      )
    }
    const scen = formatScenariosLine(fc.scenarios)
    const adjTitle =
      fc.adjRubPerSession !== 0
        ? `Надбавка ${fc.adjRubPerSession > 0 ? '+' : ''}${fc.adjRubPerSession} ₽ · ${fc.planHint}`
        : fc.planHint
    return (
      <>
        <td className="admin-mem-type-table__num mem-type-stats__pay-col">
          <div className="mem-type-stats__pay-stack">
            <strong title={`Факт ур. ${fc.levelFact}`}>{formatRub(fc.baseRub)}</strong>
            {scen ? (
              <span className="muted mem-type-stats__pay-scenarios" title="Сценарии ур. 1 / 2 / 3">
                {scen}
              </span>
            ) : null}
            {fc.planHint ? (
              <span className="muted mem-type-stats__pay-hint" title={adjTitle}>
                {fc.planHint}
              </span>
            ) : null}
          </div>
        </td>
        <td className="admin-mem-type-table__num mem-type-stats__pay-col" title={adjTitle}>
          <strong>{formatRub(fc.totalRub)}</strong>
        </td>
      </>
    )
  }

  return (
    <div className="mem-type-stats">
      {note ? (
        <p className="muted mem-type-stats__note">{note}</p>
      ) : null}
      {payrollForecast ? (
        <p className="muted mem-type-stats__note mem-type-stats__note--payroll">
          ЗП за период: база по текущему уровню плана; итого — с надбавкой кабинета. Без плана — ур. 3 и сценарии
          1/2/3. Подсказка — линейный прогноз до конца периода.
        </p>
      ) : null}
      <div className="table-wrap admin-mem-type-table-wrap">
        <table className="admin-mem-type-table">
          <thead>
            <tr>
              <th className="admin-mem-type-table__trainer-col">Тренер</th>
              {columns.map((c) => (
                <th key={c.typeId} className="admin-mem-type-table__type-col">
                  {c.code}
                </th>
              ))}
              <th className="admin-mem-type-table__sum-col">Итого</th>
              {payrollForecast ? (
                <>
                  <th className="admin-mem-type-table__num mem-type-stats__pay-col">База</th>
                  <th className="admin-mem-type-table__num mem-type-stats__pay-col">Итого ЗП</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {byTrainerByType.map((tr) => (
              <tr key={tr.trainerId || 'unknown'}>
                <td className="admin-mem-type-table__trainer-col">{label(tr.trainerId)}</td>
                {columns.map((c) => (
                  <td key={c.typeId} className="admin-mem-type-table__num">
                    {countForTrainer(tr, c.typeId)}
                  </td>
                ))}
                <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                  <strong>{typedTotalForTrainer(tr)}</strong>
                </td>
                {renderPayCells(tr.trainerId)}
              </tr>
            ))}
            <tr className="admin-mem-type-table__club-row">
              <td className="admin-mem-type-table__trainer-col">
                <strong>По клубу</strong>
              </td>
              {columns.map((c) => (
                <td key={c.typeId} className="admin-mem-type-table__num">
                  <strong>{countForClub(c.typeId)}</strong>
                </td>
              ))}
              <td className="admin-mem-type-table__num admin-mem-type-table__sum-col">
                <strong>{clubTotalTyped}</strong>
              </td>
              {renderPayCells('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
