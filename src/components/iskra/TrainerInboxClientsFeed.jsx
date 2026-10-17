import { ClipboardList, Salad } from 'lucide-react'
import { useTrainerNotifications } from '../../pages/trainer/useTrainerNotifications.js'

function NotifIcon({ kind }) {
  if (String(kind).startsWith('nutrition')) return <Salad size={20} />
  return <ClipboardList size={20} />
}

/**
 * Лента событий «отправлено / прочитал» — как сообщения, без ссылки в карточку.
 * Тап по непрочитанному = тренер прочитал (точка и бейдж гаснут, строка остаётся).
 */
export function TrainerInboxClientsFeed() {
  const { items, status, dismissPending } = useTrainerNotifications()

  if (status === 'loading' && !items.length) {
    return (
      <div className="iskra-inbox__loading muted" aria-busy>
        Загрузка…
      </div>
    )
  }

  if (!items.length) {
    return (
      <p className="iskra-inbox__empty muted">
        Пока тихо. Здесь — когда рацион или задание ушли клиенту и когда он их прочитал.
      </p>
    )
  }

  return (
    <ol className="client-inbox iskra-inbox__clients" aria-label="События по клиентам">
      {items.map((it, i) => {
        const fresh = !it.read_at
        return (
          <li key={`${it.kind}:${it.id}`} style={{ '--i': i }}>
            {fresh ? (
              <button
                type="button"
                className="client-inbox__row client-inbox__row--new client-inbox__row--msg"
                onClick={() => dismissPending(it.id)}
              >
                <span className="client-inbox__icon" aria-hidden>
                  <NotifIcon kind={it.kind} />
                </span>
                <span className="client-inbox__body">
                  <strong>{it.title}</strong>
                  <small>{it.body}</small>
                </span>
                <span className="client-inbox__dot" aria-label="Непрочитано" />
              </button>
            ) : (
              <div className="client-inbox__row client-inbox__row--msg">
                <span className="client-inbox__icon" aria-hidden>
                  <NotifIcon kind={it.kind} />
                </span>
                <span className="client-inbox__body">
                  <strong>{it.title}</strong>
                  <small>{it.body}</small>
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
