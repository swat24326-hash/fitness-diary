import { Gift, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { useLoyaltyJournal } from '../../hooks/useLoyaltyJournal.js'
import '../../styles/loyalty.css'

/**
 * Список списаний куша (фаза E).
 */
export function LoyaltyJournalSection({ clubId, listBackHref = '/admin/clients' }) {
  const { rows, q, setQ, busy, error, reload, total } = useLoyaltyJournal(clubId)

  return (
    <section className="loyalty-journal" aria-label="Журнал списаний баллов">
      <div className="loyalty-journal__toolbar">
        <input
          type="search"
          className="input loyalty-journal__search"
          placeholder="ФИО или комментарий…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Поиск в журнале баллов"
        />
        <button
          type="button"
          className="btn btn-secondary btn-icon-square btn-touch"
          onClick={() => void reload()}
          disabled={busy || !clubId}
          aria-label="Обновить"
          title="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={busy ? 'icon-spin' : undefined} />
        </button>
        <Link to={listBackHref} className="btn btn-ghost btn-touch">
          ← К клиентам
        </Link>
      </div>

      {!clubId ? (
        <p className="muted" role="status">
          Выберите клуб в шапке.
        </p>
      ) : error ? (
        <p className="loyalty-journal__error" role="alert">
          {error}
        </p>
      ) : busy && !rows.length ? (
        <p className="muted" role="status">
          Загружаю журнал…
        </p>
      ) : !rows.length ? (
        <p className="muted" role="status">
          {total === 0 ? 'Пока никто не списывал баллы.' : 'Ничего не найдено.'}
        </p>
      ) : (
        <ul className="loyalty-journal__list">
          {rows.map((row) => (
            <li key={row.id || `${row.client_id}-${row.at}`} className="loyalty-journal__row">
              <div className="loyalty-journal__who">
                <Gift size={16} aria-hidden />
                <strong>{row.client_name}</strong>
              </div>
              <div className="loyalty-journal__meta">
                <span>{formatDateTimeRu(row.at)}</span>
                <span className="loyalty-journal__points">−{row.points}</span>
              </div>
              {row.comment ? <p className="loyalty-journal__comment">{row.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
