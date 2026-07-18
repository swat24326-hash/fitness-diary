import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import {
  COACH_QUALITY_AXIS_LABELS,
  COACH_QUALITY_STATUS_LABELS,
  coachQualityRulesHelp,
} from '../lib/admin/coachQualityCore.js'

/**
 * Оценка качества ведения: ровная таблица (админ / тренер — одни правила).
 * @param {{
 *   coachQuality: object|null|undefined,
 *   trainerLabel: (id: string) => string,
 *   clientLabel?: (id: string) => string,
 *   clientHref?: (id: string) => string,
 *   selfTrainerId?: string|null,
 *   compact?: boolean,
 * }} props
 */
export function CoachQualityPanel({
  coachQuality,
  trainerLabel,
  clientLabel,
  clientHref,
  selfTrainerId = null,
  compact = false,
}) {
  const [openId, setOpenId] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const rules = coachQuality?.rules ?? coachQualityRulesHelp()

  const trainers = useMemo(() => {
    const list = coachQuality?.trainers ?? []
    if (!selfTrainerId) return list
    return list.filter((t) => t.trainerId === selfTrainerId)
  }, [coachQuality, selfTrainerId])

  if (!coachQuality || !trainers.length) {
    return (
      <section className="card admin-club-stats-detail coach-quality-panel">
        <h3 className="section-title coach-quality-panel__title">Качество ведения</h3>
        <p className="muted coach-quality-panel__empty">
          Нет строк для расчёта — обновите статистику при сети.
        </p>
        <RulesBlock rules={rules} open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
      </section>
    )
  }

  const sc = coachQuality.statusCounts ?? {}
  const colCount = 8

  return (
    <section className="card admin-club-stats-detail coach-quality-panel">
      <div className="coach-quality-panel__head">
        <div>
          <h3 className="section-title coach-quality-panel__title">
            {selfTrainerId ? 'Ваша оценка качества' : 'Качество ведения по тренерам'}
          </h3>
          <p className="muted coach-quality-panel__lead">
            Три оси: ведение · глубина дневника · хвосты в «Неактивных». Клик по строке — факты.
          </p>
        </div>
        {!compact ? (
          <div className="coach-quality-panel__chips" aria-label="Сводка статусов">
            <StatusChip status="ok" count={sc.ok ?? 0} />
            <StatusChip status="attention" count={sc.attention ?? 0} />
            <StatusChip status="review" count={sc.review ?? 0} />
            <StatusChip status="insufficient_data" count={sc.insufficient_data ?? 0} />
          </div>
        ) : null}
      </div>

      {!selfTrainerId && coachQuality.averageScorePct != null ? (
        <p className="coach-quality-panel__avg muted">
          Средний балл по клубу:{' '}
          <strong>
            {coachQuality.averageScorePct}
            <span className="coach-quality-panel__avg-den"> / 100</span>
          </strong>
          {coachQuality.medianCarePct != null ? (
            <>
              {' '}
              · медиана ведения: <strong>{coachQuality.medianCarePct}%</strong>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="coach-quality-table-wrap">
        <table className="coach-quality-table">
          <thead>
            <tr>
              <th scope="col">Тренер</th>
              <th scope="col">Статус</th>
              <th scope="col" className="coach-quality-table__num">
                Балл
              </th>
              <th scope="col" className="coach-quality-table__num">
                Трен.
              </th>
              <th scope="col" className="coach-quality-table__num">
                Ведение
              </th>
              <th scope="col" className="coach-quality-table__num">
                Глубина
              </th>
              <th scope="col" className="coach-quality-table__num">
                Хвосты
              </th>
              <th scope="col" className="coach-quality-table__chev">
                <span className="sr-only">Подробнее</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {trainers.map((tr) => {
              const open = openId === tr.trainerId
              const name = selfTrainerId ? 'Вы' : trainerLabel(tr.trainerId)
              return (
                <Fragment key={tr.trainerId}>
                  <tr
                    className={open ? 'coach-quality-table__row--open' : undefined}
                    onClick={() => setOpenId(open ? null : tr.trainerId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setOpenId(open ? null : tr.trainerId)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={open}
                  >
                    <td className="coach-quality-table__name">{name}</td>
                    <td>
                      <CoachQualityStatusBadge status={tr.status} label={tr.statusLabel} />
                    </td>
                    <td className="coach-quality-table__num coach-quality-table__score">
                      {tr.scorePct != null ? (
                        <>
                          {tr.scorePct}
                          <span className="muted">/100</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="coach-quality-table__num">{tr.completed ?? 0}</td>
                    <td className="coach-quality-table__num">
                      {tr.carePct != null ? `${tr.carePct}%` : '—'}
                    </td>
                    <td className="coach-quality-table__num">
                      {tr.depthPct != null ? `${tr.depthPct}%` : '—'}
                    </td>
                    <td className="coach-quality-table__num">
                      {tr.stuckCount}
                      {tr.bagWarnCount ? (
                        <span className="muted coach-quality-table__warn">+{tr.bagWarnCount}</span>
                      ) : null}
                    </td>
                    <td className="coach-quality-table__chev">
                      {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                    </td>
                  </tr>
                  {open ? (
                    <tr className="coach-quality-table__detail">
                      <td colSpan={colCount}>
                        <TrainerDetail
                          tr={tr}
                          clientLabel={clientLabel}
                          clientHref={clientHref}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <RulesBlock rules={rules} open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
    </section>
  )
}

function TrainerDetail({ tr, clientLabel, clientHref }) {
  return (
    <div className="coach-quality-detail">
      {tr.status === 'insufficient_data' ? (
        <p className="muted coach-quality-detail__note">
          {tr.completed > 0
            ? 'Мало данных для сравнения ведения/глубины (нужно ≥8 тренировок и ≥3 активных клиентов).'
            : 'В периоде нет завершённых тренировок — итоговый балл не ставим (это не «100»).'}
        </p>
      ) : null}
      {tr.failureDirectionLabels?.length ? (
        <p className="coach-quality-detail__drop">
          <span className="muted">Просадка:</span> {tr.failureDirectionLabels.join(' · ')}
        </p>
      ) : (
        <p className="muted coach-quality-detail__drop">Просадок нет</p>
      )}
      <div className="coach-quality-detail__meta muted">
        <span>Завершено: {tr.completed}</span>
        <span>Активных: {tr.activeClients}</span>
        <span>Тонких: {tr.minimalCompleted}</span>
        <span>Stuck ДК: {tr.stuckDk}</span>
        <span>Stuck БЗ: {tr.stuckBz}</span>
      </div>
      <p className="coach-quality-detail__sub">Куда смотреть</p>
      {(tr.failureDirections ?? []).length === 0 ? (
        <p className="muted">По правилам оценки критичных направлений нет.</p>
      ) : (
        <ul>
          {(tr.failureDirections ?? []).map((axis) => (
            <li key={axis}>{COACH_QUALITY_AXIS_LABELS[axis] ?? axis}</li>
          ))}
        </ul>
      )}
      <p className="coach-quality-detail__sub">Факты</p>
      {(tr.facts ?? []).length === 0 ? (
        <p className="muted">Список фактов пуст.</p>
      ) : (
        <ul>
          {tr.facts.map((f, i) => {
            const name =
              (clientLabel ? clientLabel(f.clientId) : null) ||
              f.clientName ||
              `клиент ${String(f.clientId).slice(0, 8)}…`
            const href = clientHref ? clientHref(f.clientId) : null
            return (
              <li key={`${f.clientId}-${f.kind}-${i}`}>
                <span className="muted">{COACH_QUALITY_AXIS_LABELS[f.axis] ?? f.axis}:</span>{' '}
                {href ? (
                  <Link to={href} onClick={(e) => e.stopPropagation()}>
                    {name}
                  </Link>
                ) : (
                  name
                )}
                {' — '}
                {f.reason}
              </li>
            )
          })}
        </ul>
      )}
      {tr.factsTotal > (tr.facts?.length ?? 0) ? (
        <p className="muted coach-quality-detail__more">
          Показано {tr.facts.length} из {tr.factsTotal}
        </p>
      ) : null}
    </div>
  )
}

function StatusChip({ status, count }) {
  return (
    <span className="coach-quality-panel__chip">
      {COACH_QUALITY_STATUS_LABELS[status] ?? status}: <strong>{count}</strong>
    </span>
  )
}

/** @param {{ status: string, label?: string }} props */
export function CoachQualityStatusBadge({ status, label }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'insufficient_data' ? Info : AlertTriangle
  const tone =
    status === 'ok'
      ? 'ok'
      : status === 'review'
        ? 'review'
        : status === 'attention'
          ? 'attention'
          : 'muted'
  return (
    <span className={`coach-quality-badge coach-quality-badge--${tone}`}>
      <Icon size={14} aria-hidden />
      {label ?? COACH_QUALITY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function RulesBlock({ rules, open, onToggle }) {
  return (
    <div className="coach-quality-panel__rules">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle}>
        {open ? 'Скрыть правила оценки' : 'Как считается (одинаково для тренера и админа)'}
      </button>
      {open ? (
        <ul className="coach-quality-panel__rules-list">
          {(rules ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
