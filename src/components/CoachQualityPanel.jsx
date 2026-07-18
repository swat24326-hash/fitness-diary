import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import {
  COACH_QUALITY_AXIS_LABELS,
  COACH_QUALITY_STATUS_LABELS,
  coachQualityRulesHelp,
} from '../lib/admin/coachQualityCore.js'

/**
 * Оценка качества ведения: админ (клуб) и тренер (свой scope) — одни правила и оси просадки.
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
      <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
        <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 8px' }}>
          Качество ведения
        </h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Здесь будет оценка тренеров (ведение, глубина дневника, хвосты в «Неактивных»). Сейчас нет строк для
          расчёта — обновите статистику при сети; сводка сверху может уже быть с сервера, а оценка подтянется после
          загрузки клиентов и тренировок.
        </p>
        <RulesBlock rules={rules} open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
      </section>
    )
  }

  const sc = coachQuality.statusCounts ?? {}

  return (
    <section className="card admin-club-stats-detail" style={{ marginBottom: 20, padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <h3 className="section-title" style={{ fontSize: '1rem', margin: '0 0 4px' }}>
            Качество ведения
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Три оси: ведение · глубина дневника · хвосты в «Неактивных» (ДК и после БЗ). Просадка видна по направлению.
          </p>
        </div>
        {!compact ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
            <StatusChip status="ok" count={sc.ok ?? 0} />
            <StatusChip status="attention" count={sc.attention ?? 0} />
            <StatusChip status="review" count={sc.review ?? 0} />
            <StatusChip status="insufficient_data" count={sc.insufficient_data ?? 0} />
          </div>
        ) : null}
      </div>

      {coachQuality.medianCarePct != null && !selfTrainerId ? (
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>
          <span className="muted">Медиана ведения по клубу:</span>{' '}
          <strong>{coachQuality.medianCarePct}%</strong>
        </p>
      ) : null}

      <div className="grid" style={{ gap: 10 }}>
        {trainers.map((tr) => {
          const open = openId === tr.trainerId
          return (
            <div key={tr.trainerId} className="card" style={{ padding: 12, margin: 0 }}>
              <button
                type="button"
                className="row"
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onClick={() => setOpenId(open ? null : tr.trainerId)}
                aria-expanded={open}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 15 }}>
                    {selfTrainerId ? 'Ваша оценка' : trainerLabel(tr.trainerId)}
                  </p>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <CoachQualityStatusBadge status={tr.status} label={tr.statusLabel} />
                    {tr.failureDirectionLabels?.length ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Просадка: {tr.failureDirectionLabels.join(' · ')}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Просадок нет
                      </span>
                    )}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 12, fontSize: 13, marginTop: 8 }}>
                    <span>
                      <span className="muted">Ведение:</span>{' '}
                      <strong>{tr.carePct != null ? `${tr.carePct}%` : '—'}</strong>
                    </span>
                    <span>
                      <span className="muted">Глубина:</span>{' '}
                      <strong>{tr.depthPct != null ? `${tr.depthPct}%` : '—'}</strong>
                    </span>
                    <span>
                      <span className="muted">Хвосты:</span>{' '}
                      <strong>{tr.stuckCount}</strong>
                      {tr.bagWarnCount ? (
                        <span className="muted"> (+{tr.bagWarnCount} в коридоре 8–14 дн.)</span>
                      ) : null}
                    </span>
                  </div>
                </div>
                {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
              </button>

              {open ? (
                <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 10, fontSize: 12, marginBottom: 8 }}>
                    <span className="muted">Завершено: {tr.completed}</span>
                    <span className="muted">Активных клиентов: {tr.activeClients}</span>
                    <span className="muted">Тонких записей: {tr.minimalCompleted}</span>
                    <span className="muted">Stuck ДК: {tr.stuckDk}</span>
                    <span className="muted">Stuck после БЗ: {tr.stuckBz}</span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Куда смотреть</p>
                  {(tr.failureDirections ?? []).length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      По правилам оценки критичных направлений нет.
                    </p>
                  ) : (
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13 }}>
                      {(tr.failureDirections ?? []).map((axis) => (
                        <li key={axis}>{COACH_QUALITY_AXIS_LABELS[axis] ?? axis}</li>
                      ))}
                    </ul>
                  )}
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Факты</p>
                  {(tr.facts ?? []).length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      Список фактов пуст.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
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
                    <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                      Показано {tr.facts.length} из {tr.factsTotal}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <RulesBlock rules={rules} open={rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
    </section>
  )
}

function StatusChip({ status, count }) {
  return (
    <span
      className="muted"
      style={{
        padding: '4px 8px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        whiteSpace: 'nowrap',
      }}
    >
      {COACH_QUALITY_STATUS_LABELS[status] ?? status}: <strong style={{ color: 'inherit' }}>{count}</strong>
    </span>
  )
}

/** @param {{ status: string, label?: string }} props */
export function CoachQualityStatusBadge({ status, label }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'insufficient_data' ? Info : AlertTriangle
  const color =
    status === 'ok'
      ? 'var(--success, #4ade80)'
      : status === 'review'
        ? 'var(--danger, #f87171)'
        : status === 'attention'
          ? 'var(--warning, #fbbf24)'
          : 'inherit'
  return (
    <span className="row" style={{ gap: 4, alignItems: 'center', color, fontSize: 13, fontWeight: 600 }}>
      <Icon size={16} aria-hidden />
      {label ?? COACH_QUALITY_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function RulesBlock({ rules, open, onToggle }) {
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle}>
        {open ? 'Скрыть правила оценки' : 'Как считается (одинаково для тренера и админа)'}
      </button>
      {open ? (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {(rules ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
