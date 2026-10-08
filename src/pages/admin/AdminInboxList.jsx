import { ChevronRight, ClipboardList, Gift, Megaphone, RefreshCw } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import { inboxRecipientsLabelRu, inboxStatsLineRu, inboxStatusLabelRu } from '../../lib/inbox/inboxAdminUiCore.js'

function clubsLabel(ids, clubs) {
  if (!ids?.length) return ''
  if (ids.length > 2) return `${ids.length} клубов`
  const byId = new Map(clubs.map((c) => [String(c.id), c.name]))
  return ids.map((id) => byId.get(String(id)) || 'Клуб').join(', ')
}

/** Последние рассылки: вид, охват, статус. */
export function AdminInboxList({ list, onOpen }) {
  const { campaigns, clubs, busy, error, reload } = list
  return (
    <section className="admin-inbox__list-wrap" aria-label="Опросы и объявления">
      <div className="admin-inbox__toolbar">
        <span className="muted">{campaigns ? `Последние ${campaigns.length}` : ''}</span>
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
      {!campaigns ? (
        busy ? (
          <p className="muted" role="status">
            Загружаю рассылки…
          </p>
        ) : null
      ) : !campaigns.length ? (
        <div className="card admin-inbox__empty">
          <p>Рассылок ещё не было.</p>
          <p className="muted">Опрос — оценки и ответы клиентов или команды (клиентам можно с баллами). Объявление — просто сообщение во «Входящие».</p>
        </div>
      ) : (
        <ul className="admin-inbox__list">
          {campaigns.map((c) => {
            const Icon = c.kind === 'survey' ? ClipboardList : Megaphone
            return (
              <li key={c.id}>
                <button type="button" className="admin-inbox__row" onClick={() => onOpen(c.id)}>
                  <span className={`admin-inbox__kind${c.open ? '' : ' admin-inbox__kind--closed'}`} aria-hidden>
                    <Icon size={20} />
                  </span>
                  <span className="admin-inbox__row-body">
                    <strong>{c.title}</strong>
                    <small>
                      {inboxStatusLabelRu(c)} · {formatDateRu(String(c.created_at).slice(0, 10))} · {clubsLabel(c.club_ids, clubs)} ·{' '}
                      {inboxRecipientsLabelRu(c)}
                    </small>
                    <small className="admin-inbox__row-stats">{inboxStatsLineRu(c.kind, c.stats)}</small>
                  </span>
                  {c.reward_points > 0 ? (
                    <span className="admin-inbox__reward" title="Баллы за прохождение">
                      <Gift size={14} aria-hidden />+{c.reward_points}
                    </span>
                  ) : null}
                  <ChevronRight size={18} className="admin-inbox__go" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
