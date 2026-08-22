import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MessageSquare, PhoneForwarded, CheckCircle2 } from 'lucide-react'
import { formatIsoRu } from '../../lib/period'
import { buildClubCallShiftSummaryCards } from '../../lib/admin/clubCallShiftSummaryCore.js'
import '../../styles/club-call.css'

const ICONS = {
  calls: Phone,
  sms: MessageSquare,
  followup: PhoneForwarded,
  closed: CheckCircle2,
}

/**
 * Компактная сводка смены call-центра на главной управляющего / админа.
 * @param {{
 *   summary: object | null,
 *   journalHref?: string,
 *   loading?: boolean,
 *   noClub?: boolean,
 *   error?: string,
 * }} props
 */
export function ClubCallShiftSummaryPanel({
  summary = null,
  journalHref = '/club/call-log',
  loading = false,
  noClub = false,
  error = '',
}) {
  const cards = useMemo(
    () => (summary ? buildClubCallShiftSummaryCards(summary, { journalHref }) : []),
    [summary, journalHref],
  )
  const errText = String(error ?? '').trim()

  if (noClub) {
    return (
      <section className="club-call-shift" aria-labelledby="club-call-shift-title">
        <h2 id="club-call-shift-title" className="club-call-shift__title">
          Сводка смены
        </h2>
        <p className="club-call-shift__hint muted">Выберите клуб, чтобы увидеть связь за день.</p>
      </section>
    )
  }

  if (loading && !summary) {
    return (
      <section className="club-call-shift club-call-shift--skel" aria-labelledby="club-call-shift-title" aria-busy="true">
        <h2 id="club-call-shift-title" className="club-call-shift__title">
          Сводка смены
        </h2>
        <ul className="club-call-shift__grid" aria-label="Загрузка сводки смены">
          <li className="admin-home-skel club-call-shift__skel" />
          <li className="admin-home-skel club-call-shift__skel" />
          <li className="admin-home-skel club-call-shift__skel" />
          <li className="admin-home-skel club-call-shift__skel" />
        </ul>
      </section>
    )
  }

  if (!summary) {
    if (!errText) return null
    return (
      <section className="club-call-shift" aria-labelledby="club-call-shift-title">
        <h2 id="club-call-shift-title" className="club-call-shift__title">
          Сводка смены
        </h2>
        <p className="club-call-shift__hint club-call-shift__hint--err" role="alert">
          {errText}
        </p>
        <p className="club-call-shift__foot">
          <Link to={journalHref} className="club-call-shift__link">
            Открыть журнал звонков
          </Link>
        </p>
      </section>
    )
  }

  const dayLabel = summary.day ? formatIsoRu(summary.day) : 'сегодня'

  return (
    <section
      className={`club-call-shift${summary.is_hot ? ' club-call-shift--hot' : ''}`}
      aria-labelledby="club-call-shift-title"
      aria-busy={loading || undefined}
    >
      <div className="club-call-shift__head">
        <h2 id="club-call-shift-title" className="club-call-shift__title">
          Сводка смены
        </h2>
        <p className="club-call-shift__hint muted">
          {summary.has_activity
            ? `Связь за ${dayLabel}${summary.connect_rate_pct != null ? ` · дозвон ${summary.connect_rate_pct}%` : ''}`
            : `За ${dayLabel} звонков и SMS пока нет`}
        </p>
      </div>
      {errText ? (
        <p className="club-call-shift__hint club-call-shift__hint--warn" role="status">
          {errText}
        </p>
      ) : null}
      <ul className="club-call-shift__grid" aria-label="Показатели смены">
        {cards.map((card) => {
          const Icon = ICONS[card.key] || Phone
          return (
            <li key={card.key}>
              <Link
                to={card.to}
                className={`club-call-shift__card u-no-decoration${card.hot ? ' club-call-shift__card--hot' : ''}${card.warn ? ' club-call-shift__card--warn' : ''}`}
                aria-label={`${card.label}: ${card.count}. ${card.hint}`}
              >
                <span className="club-call-shift__card-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="club-call-shift__card-count">{card.count}</span>
                <span className="club-call-shift__card-label">{card.label}</span>
                <span className="club-call-shift__card-hint">{card.hint}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="club-call-shift__foot">
        <Link to={journalHref} className="club-call-shift__link">
          Открыть журнал звонков
        </Link>
      </p>
    </section>
  )
}
