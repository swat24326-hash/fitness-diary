import { useMemo } from 'react'
import {
  formatRetentionRatePct,
  formatTenureDays,
  formatTrainerM3Cell,
  isTrainerM3Immature,
  retentionRateTone,
  summarizeArchiveReasonMix,
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

  const archiveReasons = useMemo(
    () => summarizeArchiveReasonMix(r?.archiveReasonMix, r?.archivesInPeriod),
    [r?.archiveReasonMix, r?.archivesInPeriod],
  )
  const reasonMax = useMemo(
    () => archiveReasons.rows.reduce((max, row) => Math.max(max, row.count), 0),
    [archiveReasons.rows],
  )

  if (!r || (r.poolSize === 0 && r.universeSize === 0)) {
    return (
      <section className="card admin-club-stats-detail client-retention-panel">
        <h3 className="section-title client-retention-panel__title">Удержание клиентов</h3>
        <p className="muted client-retention-panel__empty">
          Нет клиентов с планшетом для расчёта — обновите при сети или выберите другой период.
        </p>
      </section>
    )
  }

  const showReasons = !compact && archiveReasons.rows.length > 0
  const showTrainers = !compact && !selfTrainerId && trainerRows.length > 0

  return (
    <section className="card admin-club-stats-detail client-retention-panel">
      <header className="client-retention-panel__head">
        <h3 className="section-title client-retention-panel__title">
          {selfTrainerId ? 'Ваше удержание' : 'Удержание клиентов'}
        </h3>
        {!compact ? (
          <div className="client-retention-panel__about" role="note">
            {selfTrainerId ? (
              <>
                <p className="client-retention-panel__about-lead">
                  <strong>Зачем вам:</strong> честная картина по вашим клиентам с планшетом — остаются ли они
                  ходить, продлевают абон, как долго живут в зале. Это не оценка ЗП и не «Качество ведения».
                </p>
                <ul className="client-retention-panel__about-list">
                  <li>
                    <strong>Удержание M+3</strong> — прижились ли люди через 3 месяца после первого абонемента.
                  </li>
                  <li>
                    <strong>Продления</strong> — кто из ваших клиентов продлил абон в ближайшие 14 дней после
                    окончания.
                  </li>
                  <li>
                    <strong>Медиана жизни</strong> — сколько в среднем клиент «живёт» у вас до архива или до
                    сегодня.
                  </li>
                  <li>
                    Если M+3 показывает «—» или «Рано» — клиенты только начали, цифру рано сравнивать с
                    коллегами.
                  </li>
                </ul>
              </>
            ) : (
              <>
                <p className="client-retention-panel__about-lead">
                  <strong>Зачем клубу:</strong> видеть, удерживаем ли клиентов ПЗ с планшетом — не только сколько
                  пришло, но кто остался ходить, продлил абон и почему ушёл в архив. Отдельно от «Качества
                  ведения» и чипа «Не активные».
                </p>
                <ul className="client-retention-panel__about-list">
                  <li>Сводка по клубу — карточки сверху; сравнение тренеров — таблица ниже.</li>
                  <li>
                    «Архив за период» — кто ушёл <em>в выбранном месяце/квартале</em>, не все 25 во вкладке
                    «Архив».
                  </li>
                  <li>Причины архива — из модалки «В архив», чтобы понимать отток.</li>
                </ul>
              </>
            )}
          </div>
        ) : (
          <p className="muted client-retention-panel__lead">
            ПЗ с планшетом. Не путать с «Качеством ведения» и чипами «Не активные».
          </p>
        )}
      </header>

      {!compact ? (
        <details className="client-retention-panel__explain">
          <summary className="client-retention-panel__explain-summary">Подробнее про каждую цифру</summary>
          <ul className="client-retention-panel__explain-list">
            <li>
              <strong>Удержание M+3</strong> — доля клиентов с хотя бы одним ДК в 3‑м месяце после первого
              абонемента (только «созревшие» когорты).
            </li>
            <li>
              <strong>Продления</strong> — из тех, у кого абон заканчивался в последние 14 дней, сколько
              продлили.
            </li>
            <li>
              <strong>Архив за период</strong> — сколько убрали в архив в выбранном периоде; «база» — все
              клиенты ПЗ с планшетом для расчёта, не вкладка «Архив».
            </li>
            <li>
              <strong>Медиана жизни</strong> — типичный срок от первого ДК до архива или до сегодня; половина
              клиентов живут меньше, половина — дольше.
            </li>
            <li>
              <strong>Возвраты</strong> — вернули из архива и снова ходили в течение 30 дней (журнал «Вернуть»).
            </li>
            <li>
              <strong>«Рано»</strong> у тренера — клиенты в базе есть, но с их старта прошло меньше ~3
              месяцев, M+3 ещё нельзя считать.
            </li>
          </ul>
        </details>
      ) : null}

      <div className="client-retention-kpi-grid" role="list">
        <KpiCard
          primary
          tone={m3Tone}
          label="Удержание M+3"
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
          label="Архив клуба"
          tone={r.archiveRate != null && r.archiveRate > 0.15 ? 'low' : 'none'}
          value={formatRetentionRatePct(r.archiveRate)}
          hint={`${r.archivesInPeriod ?? 0} ушли · база ${r.universeSize ?? 0}`}
        />
        <KpiCard
          label="Закрытия ПЗ"
          tone={r.pzChurnRate != null && r.pzChurnRate > 0.2 ? 'low' : 'none'}
          value={formatRetentionRatePct(r.pzChurnRate)}
          hint={
            (r.pzChurnInPeriod ?? 0) > 0
              ? `${r.pzChurnInPeriod} закрытий · ${r.pzChurnTransitions ?? 0} переход в ТЗ/АЗ`
              : 'Нет закрытий ПЗ за период'
          }
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
              : 'Нет возвратов за 90 дн.'
          }
        />
        <KpiCard
          label="Активных сейчас"
          value={String(r.poolSize ?? 0)}
          hint={`База для удержания · ${r.universeSize ?? 0} всего`}
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
                            {row.tenureClientCount} кли.
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
      <span className="muted client-retention-kpi__hint">{hint}</span>
    </div>
  )
}
