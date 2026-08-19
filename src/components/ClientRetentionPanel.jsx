import { useMemo } from 'react'
import {
  formatRetentionRatePct,
  formatTenureDays,
  formatTrainerM3Cell,
  isTrainerM3Immature,
  retentionRateTone,
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

  const reasonRows = useMemo(() => topArchiveReasonRows(r?.archiveReasonMix, 6), [r?.archiveReasonMix])
  const reasonMax = useMemo(
    () => reasonRows.reduce((max, row) => Math.max(max, row.count), 0),
    [reasonRows],
  )

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

  const showSplit = !compact && (reasonRows.length > 0 || (!selfTrainerId && trainerRows.length > 0))

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
        {!compact ? (
          <div className="client-retention-panel__chips" aria-label="Сводка базы">
            <SummaryChip label="Активных" value={r.poolSize ?? 0} />
            <SummaryChip label="База" value={r.universeSize ?? 0} />
            <SummaryChip label="В архиве за период" value={r.archivesInPeriod ?? 0} />
          </div>
        ) : null}
      </div>

      <div className="client-retention-kpi-grid" role="list">
        <KpiCard
          featured
          tone={m3Tone}
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
          tone={retentionRateTone(r.renewalRate)}
          value={formatRetentionRatePct(r.renewalRate)}
          hint={
            r.renewalEligible
              ? `${r.renewalRenewed ?? 0} из ${r.renewalEligible} · окно 14 дн.`
              : 'Нет истекающих абонов в окне'
          }
        />
        <KpiCard
          label="Архив за период"
          tone={r.archiveRate != null && r.archiveRate > 0.15 ? 'low' : 'none'}
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
          tone={retentionRateTone(r.reactivationRate)}
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

      {showSplit ? (
        <div className="client-retention-split">
          {reasonRows.length ? (
            <div className="client-retention-reasons">
              <p className="client-retention-section__title">Причины архива за период</p>
              <ul className="client-retention-reasons__list">
                {reasonRows.map((row) => (
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
            </div>
          ) : null}

          {!selfTrainerId && trainerRows.length ? (
            <div className="client-retention-trainers">
              <p className="client-retention-section__title">По тренерам (tablet)</p>
              <div className="table-scroll client-retention-trainers__scroll">
                <table className="client-retention-trainers__table">
                  <thead>
                    <tr>
                      <th scope="col">Тренер</th>
                      <th scope="col">M+3</th>
                      <th scope="col" className="client-retention-trainers__num">
                        M+3 · чел.
                      </th>
                      <th scope="col">Медиана жизни</th>
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
                          <td>
                            <span
                              className={`client-retention-rate client-retention-rate--${m3Cell.tone}`}
                              title={immature ? 'Клиенты есть, но M+3 ещё не созрел (нужно ~3 мес.)' : undefined}
                            >
                              {m3Cell.text}
                            </span>
                          </td>
                          <td className="client-retention-trainers__num">{row.retentionM3?.cohortSize ?? 0}</td>
                          <td title={row.tenureClientCount ? `${row.tenureClientCount} кли. в базе` : undefined}>
                            {formatTenureDays(row.medianTenureDays)}
                            {row.tenureClientCount ? (
                              <span className="client-retention-trainers__sub muted"> · {row.tenureClientCount} кли.</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted client-retention-trainers__hint">
                M+3 — только зрелые когорты. «Рано» — клиенты есть, но прошло меньше ~3 мес. с их старта. Медиана
                жизни — все tablet-клиенты тренера.
              </p>
            </div>
          ) : null}
        </div>
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
 * @param {{ label: string, value: string|number }} props
 */
function SummaryChip({ label, value }) {
  return (
    <span className="client-retention-panel__chip">
      {label}: <strong>{value}</strong>
    </span>
  )
}

/**
 * @param {{ label: string, value: string, hint: string, tone?: string, featured?: boolean }} props
 */
function KpiCard({ label, value, hint, tone = 'none', featured = false }) {
  return (
    <div
      className={`client-retention-kpi${featured ? ' client-retention-kpi--featured' : ''}${tone !== 'none' ? ` client-retention-kpi--${tone}` : ''}`}
      role="listitem"
    >
      <span className="client-retention-kpi__label">{label}</span>
      <strong className="client-retention-kpi__value">{value}</strong>
      <span className="muted client-retention-kpi__hint">{hint}</span>
    </div>
  )
}
