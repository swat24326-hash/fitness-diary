import { ArrowLeft, Star } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { useAdminClientRatingDetail } from './useAdminClientRatings.js'

/** Деталь одной оценки клиента. */
export function AdminInboxRatingDetail({ id, onBack }) {
  const { rating, busy, error } = useAdminClientRatingDetail(id)

  return (
    <section className="admin-inbox__rating-detail" aria-label="Оценка клиента">
      <div className="admin-inbox__toolbar">
        <button type="button" className="btn btn-secondary btn-touch" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
          К списку
        </button>
      </div>
      {error ? (
        <p className="admin-inbox__error" role="alert">
          {error}
        </p>
      ) : null}
      {busy && !rating ? (
        <p className="muted" role="status">
          Загружаю…
        </p>
      ) : null}
      {!busy && !rating && !error ? (
        <div className="card admin-inbox__empty">
          <p>Оценка не найдена.</p>
        </div>
      ) : null}
      {rating ? (
        <div className={`card admin-inbox__rating-card${rating.low ? ' admin-inbox__rating-card--low' : ''}`}>
          <div className="admin-inbox__rating-head">
            <span className={`admin-inbox__kind admin-inbox__kind--rating${rating.low ? ' admin-inbox__kind--low' : ''}`} aria-hidden>
              <Star size={22} />
            </span>
            <div>
              <h2 className="admin-inbox__rating-name">{rating.client_name}</h2>
              <p className="muted admin-inbox__rating-meta">
                {formatDateTimeRu(rating.answered_at)}
                {rating.club_name ? ` · ${rating.club_name}` : ''}
              </p>
            </div>
            <p className={`admin-inbox__rating-score${rating.low ? ' admin-inbox__rating-score--low' : ''}`} aria-label={`Оценка ${rating.score_label}`}>
              {rating.score_label}★
            </p>
          </div>
          <div className="admin-inbox__rating-comment">
            <h3>Комментарий</h3>
            {rating.comment ? <p>{rating.comment}</p> : <p className="muted">Без комментария</p>}
          </div>
          {rating.low ? (
            <p className="admin-inbox__rating-alert" role="status">
              Ниже 4 — стоит связаться с клиентом.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
