import { ChevronRight, RefreshCw, Star } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { useAdminClientRatingsList } from './useAdminClientRatings.js'

/** Список оценок абонемента от клиентов. */
export function AdminInboxRatingsList({ onOpen }) {
  const { items, busy, error, reload } = useAdminClientRatingsList()

  return (
    <section className="admin-inbox__list-wrap" aria-label="Оценки клиентов">
      <div className="admin-inbox__toolbar">
        <span className="muted">{items ? `Последние ${items.length}` : ''}</span>
        <button
          type="button"
          className="btn btn-secondary btn-icon-square btn-touch"
          onClick={reload}
          disabled={busy}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={busy ? 'icon-spin' : undefined} />
        </button>
      </div>
      {error ? (
        <p className="admin-inbox__error" role="alert">
          {error}
        </p>
      ) : null}
      {!items ? (
        busy ? (
          <p className="muted" role="status">
            Загружаю оценки…
          </p>
        ) : null
      ) : !items.length ? (
        <div className="card admin-inbox__empty">
          <p>Оценок ещё нет.</p>
          <p className="muted">Клиент оценивает абонемент после последней тренировки пакета — ответ появится здесь.</p>
        </div>
      ) : (
        <ul className="admin-inbox__list">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`admin-inbox__row${r.low ? ' admin-inbox__row--low' : ''}`}
                onClick={() => onOpen(r.id)}
              >
                <span className={`admin-inbox__kind admin-inbox__kind--rating${r.low ? ' admin-inbox__kind--low' : ''}`} aria-hidden>
                  <Star size={20} />
                </span>
                <span className="admin-inbox__row-body">
                  <strong>
                    {r.client_name}
                    <span className={`admin-inbox__score${r.low ? ' admin-inbox__score--low' : ''}`}>
                      {' '}
                      · {r.score_label}★
                    </span>
                  </strong>
                  <small>
                    {formatDateTimeRu(r.answered_at)}
                    {r.club_name ? ` · ${r.club_name}` : ''}
                  </small>
                  <small className="admin-inbox__row-stats">{r.comment_preview}</small>
                </span>
                <ChevronRight size={18} className="admin-inbox__go" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
