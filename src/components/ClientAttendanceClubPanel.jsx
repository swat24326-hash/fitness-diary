import { Link } from 'react-router-dom'
import {
  clubAvgVisitsTone,
  formatClubAttendancePct,
  formatClubAvgVisitsPerWeek,
} from '../lib/admin/clubAttendanceAggCore'
import { buildAdminClubQueryHref } from '../lib/admin/adminClientQuickFilters'
import '../styles/client-retention.css'

const REGULARITY_ROWS = [
  { key: 'regular', label: 'Регулярно', hint: '≥1.5 / нед, перерывы <14 дн.' },
  { key: 'moderate', label: 'Норма', hint: '≥1 / нед в среднем' },
  { key: 'rare', label: 'Редко', hint: 'ниже 1 / нед' },
  { key: 'none', label: 'Нет визитов', hint: 'в окне 30 дн. не ходили' },
  { key: 'insufficient', label: 'Мало данных', hint: 'короткий след визитов' },
]

/**
 * Drill-down «Посещаемость» — аналитика цифр (средняя / структура / тренеры), без списка клиентов.
 *
 * @param {{
 *   clientAttendance: object | null,
 *   busy?: boolean,
 *   clubId?: string,
 *   clientsPath?: string,
 *   trainerLabel?: (id: string) => string,
 *   selfTrainerId?: string | null,
 * }} props
 */
export function ClientAttendanceClubPanel({
  clientAttendance,
  busy = false,
  clubId = '',
  clientsPath = '/admin/clients',
  trainerLabel = (id) => id,
  selfTrainerId = null,
}) {
  if (busy) {
    return (
      <section className="card admin-club-stats-detail client-retention-panel">
        <p className="muted client-retention-panel__empty">Считаем посещаемость…</p>
      </section>
    )
  }

  if (!clientAttendance || !(clientAttendance.poolSize > 0)) {
    return (
      <section className="card admin-club-stats-detail client-retention-panel">
        <h3 className="section-title client-retention-panel__title">Посещаемость ПЗ</h3>
        <p className="muted client-retention-panel__empty">
          {clientAttendance?.visitsDataMissing
            ? 'Не удалось загрузить визиты за окно. Sync и обновите статистику.'
            : 'Нет клиентов с активным абонементом ПЗ в пуле планшета на сегодня. Если в «Клиентах» абоны видны — Sync и обновите статистику.'}
        </p>
      </section>
    )
  }

  const pool = Number(clientAttendance.poolSize) || 0
  const slipped = Number(clientAttendance.slippedCount) || 0
  const by = clientAttendance.byRegularity ?? {}
  const byPct = clientAttendance.byRegularityPct ?? {}
  const avgTone = clubAvgVisitsTone(clientAttendance.avgVisitsPerWeek)
  const listHref = buildAdminClubQueryHref(clientsPath, {
    clubId,
    filter: 'attendance_slip',
  })

  const trainerRows = Array.isArray(clientAttendance.byTrainer)
    ? selfTrainerId
      ? clientAttendance.byTrainer.filter((r) => r.trainerId === selfTrainerId)
      : clientAttendance.byTrainer
    : []
  const showTrainers = trainerRows.length > 0

  const mixMax = Math.max(
    0,
    ...REGULARITY_ROWS.map((row) => Number(by[row.key]) || 0),
  )

  return (
    <section className="card admin-club-stats-detail client-retention-panel">
      <header className="client-retention-panel__head">
        <h3 className="section-title client-retention-panel__title">Посещаемость ПЗ</h3>
        <div className="client-retention-panel__about" role="note">
          <p className="client-retention-panel__about-lead">
            <strong>Зачем клубу:</strong> сколько в среднем ходят клиенты с активным абоном (планшет), и где
            проседает ритм — до того, как человек уйдёт в архив. Это не «проведено тренировок» за период.
          </p>
          <ul className="client-retention-panel__about-list">
            <li>
              <strong>Средняя посещаемость</strong> — (сумма завершённых тренировок в окне ÷ число
              клиентов в пуле) × (7 ÷ {clientAttendance.windowDays ?? 30} дн.). На{' '}
              {clientAttendance.asOf ?? 'сегодня'}.
            </li>
            <li>
              <strong>Без выпадения</strong> — доля пула без паузы ≥14 дн. с последнего визита.
            </li>
            <li>Структура ритма и таблица по тренерам — для сравнения, не список ФИО.</li>
          </ul>
        </div>
      </header>

      <div className="client-retention-kpi-grid" role="list">
        <KpiCard
          primary
          tone={avgTone}
          label="Средняя (трен./нед)"
          value={formatClubAvgVisitsPerWeek(clientAttendance.avgVisitsPerWeek)}
          hint={
            clientAttendance.medianVisitsPerWeek != null
              ? `медиана ${formatClubAvgVisitsPerWeek(clientAttendance.medianVisitsPerWeek)} · ${clientAttendance.totalVisitsInWindow ?? 0} визитов в окне`
              : `${clientAttendance.totalVisitsInWindow ?? 0} визитов в окне`
          }
        />
        <KpiCard
          tone={
            clientAttendance.inRhythmPct == null
              ? 'none'
              : clientAttendance.inRhythmPct >= 70
                ? 'good'
                : clientAttendance.inRhythmPct >= 50
                  ? 'mid'
                  : 'low'
          }
          label="Без выпадения"
          value={formatClubAttendancePct(clientAttendance.inRhythmPct)}
          hint={`${clientAttendance.inRhythmCount ?? 0} из ${pool}`}
        />
        <KpiCard
          tone={
            clientAttendance.slippedPct != null && clientAttendance.slippedPct >= 25
              ? 'low'
              : clientAttendance.slippedPct != null && clientAttendance.slippedPct >= 12
                ? 'mid'
                : 'none'
          }
          label="Выпали из ритма"
          value={formatClubAttendancePct(clientAttendance.slippedPct)}
          hint={`${slipped} чел. · ≥14 дн. без визита`}
        />
        <KpiCard
          label="В пуле"
          value={String(pool)}
          hint={
            clientAttendance.avgVisitsInWindow != null
              ? `ср. ${Number(clientAttendance.avgVisitsInWindow).toFixed(2)} визита на чел. за окно`
              : 'активный абон · планшет ПЗ'
          }
        />
      </div>

      <section className="client-retention-panel__block client-retention-reasons">
        <header className="client-retention-reasons__head">
          <h4 className="client-retention-section__title">Структура ритма</h4>
          <div className="client-retention-reasons__meta">
            <strong className="client-retention-reasons__total">{pool}</strong>
            <span className="muted client-retention-reasons__top">доля пула с активным абоном</span>
          </div>
        </header>
        <ul className="client-retention-reasons__list">
          {REGULARITY_ROWS.map((row) => {
            const count = Number(by[row.key]) || 0
            const pct = byPct[row.key] != null ? byPct[row.key] : pool > 0 ? Math.round((count / pool) * 1000) / 10 : 0
            return (
              <li key={row.key}>
                <div className="client-retention-reasons__row">
                  <span className="client-retention-reasons__label" title={row.hint}>
                    {row.label} · {pct}%
                  </span>
                  <strong className="client-retention-reasons__count">{count}</strong>
                </div>
                <div
                  className="client-retention-reasons__bar"
                  role="presentation"
                  style={{ '--pct': mixMax ? `${Math.round((count / mixMax) * 100)}%` : '0%' }}
                />
              </li>
            )
          })}
        </ul>
      </section>

      {showTrainers ? (
        <section className="client-retention-panel__block client-retention-trainers">
          <h4 className="client-retention-section__title">По тренерам</h4>
          <div className="table-scroll client-retention-trainers__scroll">
            <table className="client-retention-trainers__table">
              <thead>
                <tr>
                  <th scope="col">Тренер</th>
                  <th scope="col" className="client-retention-trainers__col-m3">
                    Ср. трен./нед
                  </th>
                  <th scope="col" className="client-retention-trainers__col-num">
                    Без выпад.
                  </th>
                  <th scope="col" className="client-retention-trainers__col-num">
                    Пул
                  </th>
                  <th scope="col" className="client-retention-trainers__col-num">
                    Выпали
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainerRows.map((row) => {
                  const tone = clubAvgVisitsTone(row.avgVisitsPerWeek)
                  return (
                    <tr key={row.trainerId}>
                      <td className="client-retention-trainers__name">{trainerLabel(row.trainerId)}</td>
                      <td className="client-retention-trainers__col-m3">
                        <span className={`client-retention-rate client-retention-rate--${tone === 'none' ? 'mid' : tone}`}>
                          {formatClubAvgVisitsPerWeek(row.avgVisitsPerWeek)}
                        </span>
                      </td>
                      <td className="client-retention-trainers__col-num">
                        {formatClubAttendancePct(row.inRhythmPct)}
                      </td>
                      <td className="client-retention-trainers__col-num">{row.poolSize}</td>
                      <td className="client-retention-trainers__col-num">{row.slippedCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {clientAttendance.visitsDataMissing ? (
        <p className="client-retention-panel__note client-retention-panel__note--warn" role="status">
          Визиты за окно не загрузились (кэш пуст). Обновите страницу при сети или нажмите Sync — иначе все
          клиенты считаются «выпавшими».
        </p>
      ) : null}

      {clientAttendance.truncated ? (
        <p className="client-retention-panel__note client-retention-panel__note--warn" role="status">
          Данные обрезаны по лимиту — цифры приблизительные.
        </p>
      ) : null}

      <p className="muted client-retention-panel__note" style={{ marginTop: 12 }}>
        Список выпавших — в Клиентах.{' '}
        <Link to={listHref}>Фильтр «Выпали из ритма»</Link>
      </p>
    </section>
  )
}

function KpiCard({ label, value, hint, tone = 'none', primary = false }) {
  const className = [
    'client-retention-kpi',
    primary ? 'client-retention-kpi--primary' : '',
    tone === 'good' ? 'client-retention-kpi--good' : '',
    tone === 'mid' ? 'client-retention-kpi--mid' : '',
    tone === 'low' ? 'client-retention-kpi--low' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className} role="listitem">
      <span className="client-retention-kpi__label">{label}</span>
      <strong className="client-retention-kpi__value">{value}</strong>
      {hint ? <span className="client-retention-kpi__hint">{hint}</span> : null}
    </div>
  )
}
