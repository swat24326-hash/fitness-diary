import { useMemo } from 'react'
import {
  formatRetentionRatePct,
  formatTenureDays,
  topArchiveReasonRows,
} from '../lib/admin/clientRetentionPresentationCore.js'

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

  const trainerRows = useMemo(() => {
    const map = r?.byTrainer ?? {}
    const rows = Object.values(map).filter(Boolean)
    if (!selfTrainerId) {
      return rows.sort((a, b) => {
        const ra = a?.retentionM3?.averageRate ?? -1
        const rb = b?.retentionM3?.averageRate ?? -1
        return rb - ra
      })
    }
    return rows.filter((row) => row.trainerId === selfTrainerId)
  }, [r?.byTrainer, selfTrainerId])

  const reasonRows = useMemo(() => topArchiveReasonRows(r?.archiveReasonMix, 6), [r?.archiveReasonMix])

  if (!r || (r.poolSize === 0 && r.universeSize === 0)) {
    return (
      <section className="card admin-club-stats-detail client-retention-panel">
        <h3 className="section-title client-retention-panel__title">Удержание клиентов</h3>
        <p className="muted client-retention-panel__empty">
          Нет tablet-клиентов для расчёта — обновите при сети или выберите другой период.
        </p>
      </section>
    )
  }

  return (
    <section className="card admin-club-stats-detail client-retention-panel">
      <div className="client-retention-panel__head">
        <div>
          <h3 className="section-title client-retention-panel__title">
            {selfTrainerId ? 'Ваше удержание' : 'Удержание клиентов'}
          </h3>
          <p className="muted client-retention-panel__lead">
            Tablet ПЗ: тренировки и абоны. Не путать с «Качеством ведения» и чипами «Не активные».
          </p>
        </div>
      </div>

      <div className="client-retention-kpi-grid" role="list">
        <KpiCard
          label="Retention M+3"
          value={formatRetentionRatePct(m3?.averageRate)}
          hint={
            m3?.cohortSize
              ? `${m3.retained ?? 0} из ${m3.cohortSize} · зрелые когорты`
              : 'Нет зрелых когорт за период'
          }
        />
        <KpiCard
          label="Продления"
          value={formatRetentionRatePct(r.renewalRate)}
          hint={
            r.renewalEligible
              ? `${r.renewalRenewed ?? 0} из ${r.renewalEligible} · окно 14 дн.`
              : 'Нет истекающих абонов в окне'
          }
        />
        <KpiCard
          label="Архив за период"
          value={formatRetentionRatePct(r.archiveRate)}
          hint={`${r.archivesInPeriod ?? 0} ушли · база ${r.universeSize ?? 0}`}
        />
        <KpiCard
          label="Медиана жизни"
          value={formatTenureDays(r.medianTenureDays)}
          hint="От первого ДК до архива или сегодня"
        />
        <KpiCard
          label="Возвраты"
          value={formatRetentionRatePct(r.reactivationRate)}
          hint={
            (r.restoresInWindow ?? 0) > 0
              ? `${r.successfulReactivations ?? 0} успешных из ${r.restoresInWindow} · 90 дн.`
              : 'Нет возвратов за 90 дн. · журнал с «Вернуть»'
          }
        />
        <KpiCard
          label="Активных сейчас"
          value={String(r.poolSize ?? 0)}
          hint="Tablet-клиенты не в архиве"
        />
      </div>

      {!compact && reasonRows.length ? (
        <div className="client-retention-reasons">
          <p className="client-retention-reasons__title">Причины архива за период</p>
          <ul className="client-retention-reasons__list">
            {reasonRows.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && !selfTrainerId && trainerRows.length ? (
        <div className="client-retention-trainers">
          <p className="client-retention-trainers__title">M+3 по тренерам (tablet)</p>
          <div className="table-scroll">
            <table className="client-retention-trainers__table">
              <thead>
                <tr>
                  <th scope="col">Тренер</th>
                  <th scope="col">M+3</th>
                  <th scope="col">Клиентов</th>
                </tr>
              </thead>
              <tbody>
                {trainerRows.map((row) => (
                  <tr key={row.trainerId}>
                    <td>{trainerLabel(row.trainerId)}</td>
                    <td>{formatRetentionRatePct(row.retentionM3?.averageRate)}</td>
                    <td>{row.retentionM3?.cohortSize ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {r.truncated ? (
        <p className="muted client-retention-panel__note" role="status">
          Данные обрезаны по лимиту сервера — цифры приблизительные.
        </p>
      ) : null}
    </section>
  )
}

/**
 * @param {{ label: string, value: string, hint: string }} props
 */
function KpiCard({ label, value, hint }) {
  return (
    <div className="client-retention-kpi" role="listitem">
      <span className="client-retention-kpi__label">{label}</span>
      <strong className="client-retention-kpi__value">{value}</strong>
      <span className="muted client-retention-kpi__hint">{hint}</span>
    </div>
  )
}
