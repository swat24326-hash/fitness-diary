import { Link } from 'react-router-dom'
import { AlertTriangle, Cake, CalendarClock, Clock, Gauge, UserPlus, UserX } from 'lucide-react'
import {
  buildTrainerAttentionItems,
  groupTrainerAttentionItems,
} from '../../lib/trainer/trainerAttentionUiCore.js'

const ICONS = {
  pnk: UserPlus,
  birthdays: Cake,
  expiring: Clock,
  expired_recent: AlertTriangle,
  stale: CalendarClock,
  inactive: UserX,
}

function AttentionTile({ card }) {
  const Icon = ICONS[card.key] || Clock
  return (
    <li>
      <Link to={card.to} className="trainer-today-tile u-no-decoration">
        <span className="trainer-today-tile__icon" aria-hidden>
          <Icon size={18} />
        </span>
        <span className="trainer-today-tile__count">{card.count}</span>
        <span className="trainer-today-tile__label">{card.label}</span>
        <span className="trainer-today-tile__hint muted">{card.hint}</span>
      </Link>
    </li>
  )
}

/**
 * Главная тренера: Сегодня внимание → Зал и поводы (3 в ряд) → По абонементу.
 * Качество всегда первым в ряду с ПНК/ДР — сетка из 3 колонок не прыгает.
 */
export function TrainerHomeTodayStrip({
  summary = null,
  attentionLoading = false,
  cqGlance = null,
  cqLoading = false,
}) {
  const placeholderSummary = {
    pnk: 0,
    birthdays: 0,
    expiring: 0,
    expired_recent: 0,
    stale: 0,
    inactive: 0,
  }
  const groups = groupTrainerAttentionItems(
    buildTrainerAttentionItems(summary || (attentionLoading ? placeholderSummary : null)),
  )
  const baseGroup = groups.find((g) => g.id === 'base')
  const pathGroup = groups.find((g) => g.id === 'path')
  const cqCount = (Number(cqGlance?.thin) || 0) + (Number(cqGlance?.stuck) || 0)
  const cqHeadline = cqGlance?.hasSignal ? cqGlance.headline : 'Качество ведения — в профиле'
  const cqBusy = cqLoading && !cqGlance

  return (
    <section className="trainer-today-strip" aria-labelledby="trainer-today-strip-title">
      <div className="trainer-today-strip__head">
        <h2 id="trainer-today-strip-title" className="trainer-today-strip__title">
          Сегодня внимание
        </h2>
        {attentionLoading ? (
          <p className="trainer-today-strip__hint muted" role="status">
            Загрузка…
          </p>
        ) : summary?.actionable === 0 && cqCount === 0 ? (
          <p className="trainer-today-strip__hint muted">Всё спокойно</p>
        ) : summary?.actionable > 0 ? (
          <p className="trainer-today-strip__hint muted">
            {summary.actionable}{' '}
            {summary.actionable === 1 ? 'повод' : summary.actionable < 5 ? 'повода' : 'поводов'}
          </p>
        ) : null}
      </div>

      <div className="trainer-today-strip__rail">
        <div className="trainer-today-strip__block trainer-today-strip__block--base">
          <h3 className="trainer-today-strip__block-title">Зал и поводы</h3>
          <ul
            className="trainer-today-strip__cluster trainer-today-strip__cluster--base"
            aria-label="Зал и поводы"
          >
            <li>
              {cqBusy ? (
                <div className="trainer-today-tile trainer-today-tile--cq" aria-busy="true">
                  <span className="trainer-today-tile__icon" aria-hidden>
                    <Gauge size={18} />
                  </span>
                  <span className="trainer-today-tile__count muted">…</span>
                  <span className="trainer-today-tile__label">Качество</span>
                  <span className="trainer-today-tile__hint muted">загрузка</span>
                </div>
              ) : (
                <Link
                  to="/trainer/profile"
                  className="trainer-today-tile trainer-today-tile--cq u-no-decoration"
                  title={cqHeadline || undefined}
                >
                  <span className="trainer-today-tile__icon" aria-hidden>
                    <Gauge size={18} />
                  </span>
                  <span className="trainer-today-tile__count">{cqCount}</span>
                  <span className="trainer-today-tile__label">Качество</span>
                  <span className="trainer-today-tile__hint muted">подробнее</span>
                </Link>
              )}
            </li>
            {(baseGroup?.cards ?? []).map((card) => (
              <AttentionTile key={card.key} card={card} />
            ))}
          </ul>
        </div>

        <div className="trainer-today-strip__block trainer-today-strip__block--path">
          <h3 className="trainer-today-strip__block-title">По абонементу</h3>
          {attentionLoading && !summary ? (
            <p className="trainer-today-strip__clients-loading muted">…</p>
          ) : (
            <ul className="trainer-today-strip__cluster trainer-today-strip__cluster--path" aria-label="По абонементу">
              {(pathGroup?.cards ?? []).map((card) => (
                <AttentionTile key={card.key} card={card} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
