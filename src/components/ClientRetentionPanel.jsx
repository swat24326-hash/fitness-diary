import { useMemo } from 'react'
import {
  formatPzChurnHint,
  formatRetentionRatePct,
  formatTenureClientCountSub,
  formatTenureDays,
  formatTrainerM3Cell,
  isTrainerM3Immature,
  retentionRateTone,
  summarizeArchiveReasonMix,
} from '../lib/admin/clientRetentionPresentationCore.js'
import { adminClubStatsHelpLines } from '../lib/admin/adminClubStatsHelpCore.js'
import { AdminClubStatsHelpTip } from './admin/AdminClubStatsHelpTip.jsx'

/**
 * @param {{
 *   clientRetention: object|null|undefined,
 *   trainerLabel: (id: string) => string,
 *   selfTrainerId?: string|null,
 *   compact?: boolean,
 * }} props
 */
export function ClientRetentionPanel({
  clientRetention,
  trainerLabel,
  selfTrainerId = null,
  compact = false,
}) {
  const r = clientRetention
  const m3 = r?.retentionM3
  const m3Tone = retentionRateTone(m3?.averageRate)

  const trainerRows = useMemo(() => {
    const map = r?.byTrainer ?? {}
    const rows = Object.values(map).filter(Boolean)
    if (!selfTrainerId) {
      return rows.sort((a, b) => {
        const aImm = isTrainerM3Immature(a)
        const bImm = isTrainerM3Immature(b)
        if (aImm !== bImm) return aImm ? 1 : -1
        const ra = a?.retentionM3?.averageRate ?? -1
        const rb = b?.retentionM3?.averageRate ?? -1
        return rb - ra
      })
    }
    return rows.filter((row) => row.trainerId === selfTrainerId)
  }, [r?.byTrainer, selfTrainerId])

  const archiveReasons = useMemo(
    () => summarizeArchiveReasonMix(r?.archiveReasonMix, r?.archivesInPeriod),
    [r?.archiveReasonMix, r?.archivesInPeriod],
  )
  const reasonMax = useMemo(
    () => archiveReasons.rows.reduce((max, row) => Math.max(max, row.count), 0),
    [archiveReasons.rows],
  )

  const retentionHelp = (
    <AdminClubStatsHelpTip
      label="Что значит удержание"
      lines={adminClubStatsHelpLines('clientRetention', { isTrainerScope: Boolean(selfTrainerId) })}
    />
  )

  if (!r || (r.poolSize === 0 && r.universeSize === 0)) {
    return (
      <section className="card admin-club-stats-detail client-retention-panel">
        <div className="admin-club-stats-detail__head">
          <h3 className="section-title client-retention-panel__title">Удержание клиентов</h3>
          {retentionHelp}
        </div>
        <p className="muted client-retention-panel__empty">
          Нет клиентов с планшетом для расчёта — обновите при сети или проверьте пул ПЗ.
        </p>
      </section>
    )
  }

  const showReasons = !compact && archiveReasons.rows.length > 0
  const showTrainers = !compact && !selfTrainerId && trainerRows.length > 0

  return (
    <section className="card admin-club-stats-detail client-retention-panel">
      <header className="client-retention-panel__head">
        <div className="admin-club-stats-detail__head">
          <h3 className="section-title client-retention-panel__title">
            {selfTrainerId ? 'Ваше удержание' : 'Удержание клиентов'}
          </h3>
          {retentionHelp}
        </div>
      </header>

      <div className="client-retention-kpi-grid" role="list">
        <KpiCard
          primary
          tone={m3Tone}
          label="Удержание M+3"
          value={formatRetentionRatePct(m3?.averageRate)}
          hint={
            m3?.cohortSize
              ? `${m3.retained ?? 0} из ${m3.cohortSize} · зрелые`
              : 'Нет зрелых когорт'
          }
        />
        <KpiCard
          label="Продления 14 дн."
          tone={retentionRateTone(r.renewalRate)}
          value={formatRetentionRatePct(r.renewalRate)}
          hint={
            r.renewalEligible
              ? `${r.renewalRenewed ?? 0} из ${r.renewalEligible} · горячий срез`
              : 'Нет истекающих в окне'
          }
        />
        <KpiCard
          label="Продления за период"
          tone={retentionRateTone(r.periodRenewalRate)}
          value={formatRetentionRatePct(r.periodRenewalRate)}
          hint={
            r.periodRenewalEligible
              ? `${r.periodRenewalRenewed ?? 0} из ${r.periodRenewalEligible} · в периоде`
              : 'Нет окончаний в периоде'
          }
        />
        <KpiCard
          label="Архив за период"
          tone={r.archiveRate != null && r.archiveRate > 0.15 ? 'low' : 'none'}
          value={formatRetentionRatePct(r.archiveRate)}
          hint={`${r.archivesInPeriod ?? 0} ушли · база ${r.universeSize ?? 0}`}
        />
        <KpiCard
          label="Закрытия ПЗ"
          tone={r.pzChurnRate != null && r.pzChurnRate > 0.2 ? 'low' : 'none'}
          value={formatRetentionRatePct(r.pzChurnRate)}
          hint={formatPzChurnHint(r)}
        />
        <KpiCard
          label="Медиана жизни"
          value={formatTenureDays(r.medianTenureDays)}
          hint="От первого ДК до архива / сегодня"
        />
        <KpiCard
          label="Возвраты"
          tone={retentionRateTone(r.reactivationRate)}
          value={formatRetentionRatePct(r.reactivationRate)}
          hint={
            (r.restoresInWindow ?? 0) > 0
              ? `${r.successfulReactivations ?? 0} из ${r.restoresInWindow} · 90 дн.`
              : 'Нет возвратов · 90 дн.'
          }
        />
        <KpiCard
          label="Активные сейчас"
          value={String(r.poolSize ?? 0)}
          hint={`База · ${r.universeSize ?? 0} всего`}
        />
      </div>

      {showReasons ? (
        <section className="client-retention-panel__block client-retention-reasons">
          <header className="client-retention-reasons__head">
            <h4 className="client-retention-section__title">Причины архива за период</h4>
            <div className="client-retention-reasons__meta">
              <strong className="client-retention-reasons__total">{archiveReasons.total}</strong>
              <span className="muted client-retention-reasons__top">{archiveReasons.hint}</span>
            </div>
          </header>
          <ul className="client-retention-reasons__list">
            {archiveReasons.rows.map((row) => (
              <li key={row.label}>
                <div className="client-retention-reasons__row">
                  <span className="client-retention-reasons__label">{row.label}</span>
                  <strong className="client-retention-reasons__count">{row.count}</strong>
                </div>
                <div
                  className="client-retention-reasons__bar"
                  role="presentation"
                  style={{ '--pct': reasonMax ? `${Math.round((row.count / reasonMax) * 100)}%` : '0%' }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showTrainers ? (
        <section className="client-retention-panel__block client-retention-trainers">
          <h4 className="client-retention-section__title">По тренерам</h4>
          <div className="table-scroll client-retention-trainers__scroll">
            <table className="client-retention-trainers__table">
              <thead>
                <tr>
                  <th scope="col">Тренер</th>
                  <th scope="col" className="client-retention-trainers__col-m3">
                    M+3
                  </th>
                  <th scope="col" className="client-retention-trainers__col-num">
                    В когорте
                  </th>
                  <th scope="col" className="client-retention-trainers__col-life">
                    Медиана
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainerRows.map((row) => {
                  const m3Cell = formatTrainerM3Cell(row)
                  const immature = isTrainerM3Immature(row)
                  return (
                    <tr
                      key={row.trainerId}
                      className={immature ? 'client-retention-trainers__row--pending' : undefined}
                    >
                      <td className="client-retention-trainers__name">{trainerLabel(row.trainerId)}</td>
                      <td className="client-retention-trainers__col-m3">
                        <span
                          className={`client-retention-rate client-retention-rate--${m3Cell.tone}`}
                          title={immature ? 'M+3 ещё не созрел (~3 мес.)' : undefined}
                        >
                          {m3Cell.text}
                        </span>
                      </td>
                      <td className="client-retention-trainers__col-num">
                        {row.retentionM3?.cohortSize ?? 0}
                      </td>
                      <td className="client-retention-trainers__col-life">
                        <span className="client-retention-trainers__life-main">
                          {formatTenureDays(row.medianTenureDays)}
                        </span>
                        {row.tenureClientCount ? (
                          <span className="client-retention-trainers__life-sub muted">
                            {formatTenureClientCountSub(row.tenureClientCount)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {r.truncated ? (
        <p className="client-retention-panel__note client-retention-panel__note--warn" role="status">
          Данные обрезаны по лимиту сервера — цифры приблизительные.
        </p>
      ) : null}
    </section>
  )
}

/**
 * @param {{ label: string, value: string, hint: string, tone?: string, primary?: boolean }} props
 */
function KpiCard({ label, value, hint, tone = 'none', primary = false }) {
  return (
    <div
      className={`client-retention-kpi${primary ? ' client-retention-kpi--primary' : ''}${tone !== 'none' ? ` client-retention-kpi--${tone}` : ''}`}
      role="listitem"
    >
      <span className="client-retention-kpi__label">{label}</span>
      <strong className="client-retention-kpi__value">{value}</strong>
      <span className="client-retention-kpi__hint">{hint}</span>
    </div>
  )
}
