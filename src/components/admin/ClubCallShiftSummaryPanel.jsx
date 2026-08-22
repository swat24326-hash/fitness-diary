import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MessageSquare, PhoneForwarded, CheckCircle2 } from 'lucide-react'
import { formatIsoRu } from '../../lib/period'
import {
  buildClubCallShiftSummary,
  buildClubCallShiftSummaryCards,
} from '../../lib/admin/clubCallShiftSummaryCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import '../../styles/club-call.css'

const ICONS = {
  calls: Phone,
  sms: MessageSquare,
  followup: PhoneForwarded,
  closed: CheckCircle2,
}

/**
 * Компактная сводка смены call-центра на главной управляющего / админа.
 * При ошибке облака без кэша — 4 нулевые плитки + текст (не пустой блок).
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
  const errText = String(error ?? '').trim()
  const emptyDay = todayInTimeZoneIso()

  const cards = useMemo(() => {
    if (summary) return buildClubCallShiftSummaryCards(summary, { journalHref })
    if (errText) {
      return buildClubCallShiftSummaryCards(buildClubCallShiftSummary([], [], { day: emptyDay }), {
        journalHref,
      })
    }
    return []
  }, [summary, journalHref, errText, emptyDay])

  if (noClub) {
    return (
      <section className="club-call-shift" aria-labelledby="club-call-shift-title">
        <div className="club-call-shift__head">
          <h2 id="club-call-shift-title" className="club-call-shift__title">
            Сводка смены
          </h2>
        </div>
        <p className="club-call-shift__meta muted">Выберите клуб, чтобы увидеть связь за день.</p>
      </section>
    )
  }

  if (loading && !summary && !errText) {
    return (
      <section className="club-call-shift club-call-shift--skel" aria-labelledby="club-call-shift-title" aria-busy="true">
        <div className="club-call-shift__head">
          <h2 id="club-call-shift-title" className="club-call-shift__title">
            Сводка смены
          </h2>
        </div>
        <div className="club-call-shift__section">
          <div className="club-call-shift__section-head">
            <h3 className="club-call-shift__section-title">Связь за день</h3>
          </div>
          <ul className="club-call-shift__grid" aria-label="Загрузка сводки смены">
            <li className="admin-home-skel club-call-shift__skel" />
            <li className="admin-home-skel club-call-shift__skel" />
            <li className="admin-home-skel club-call-shift__skel" />
            <li className="admin-home-skel club-call-shift__skel" />
          </ul>
        </div>
      </section>
    )
  }

  if (!summary && !errText) return null

  const dayLabel = summary?.day ? formatIsoRu(summary.day) : formatIsoRu(emptyDay)
  const meta = errText
    ? errText
    : summary?.has_activity
      ? `Связь за ${dayLabel}${summary.connect_rate_pct != null ? ` · дозвон ${summary.connect_rate_pct}%` : ''}`
      : `За ${dayLabel} звонков и SMS пока нет`

  return (
    <section
      className={`club-call-shift${summary?.is_hot ? ' club-call-shift--hot' : ''}`}
      aria-labelledby="club-call-shift-title"
      aria-busy={loading || undefined}
    >
      <div className="club-call-shift__head">
        <h2 id="club-call-shift-title" className="club-call-shift__title">
          Сводка смены
        </h2>
        <p
          className={`club-call-shift__meta muted${errText ? (summary ? ' club-call-shift__meta--warn' : ' club-call-shift__meta--err') : ''}`}
          role={errText ? 'status' : undefined}
        >
          {meta}
        </p>
      </div>
      <div className="club-call-shift__section">
        <div className="club-call-shift__section-head">
          <h3 className="club-call-shift__section-title">Связь за день</h3>
          <Link to={journalHref} className="club-call-shift__link">
            Журнал звонков
          </Link>
        </div>
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
                  <span className="club-call-shift__card-hint muted">{card.hint}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
