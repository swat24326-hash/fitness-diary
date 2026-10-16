import { Link } from 'react-router-dom'
import { Bell, ChevronRight, ClipboardList, Salad } from 'lucide-react'
import { StaffNotificationsSettingsBlock } from '../../components/notifications/StaffNotificationsSettingsBlock.jsx'
import { useAuth } from '../../context/AuthContext'
import { useTrainerNotifications } from './useTrainerNotifications.js'

function NotifIcon({ kind }) {
  if (String(kind).startsWith('nutrition')) return <Salad size={20} />
  return <ClipboardList size={20} />
}

/** /trainer/notifications — лента заданий/рационов + настройки push в одном экране. */
export function TrainerNotificationsPage() {
  const { user } = useAuth()
  const { items, status } = useTrainerNotifications()

  return (
    <div className="trainer-notif-page">
      <h1 className="section-title">Уведомления</h1>
      <StaffNotificationsSettingsBlock
        clubId={user?.club_id ?? ''}
        showPush
        showChatSound
        showScheduleReminders
      />
      <section className="staff-notif-feed" aria-label="События по клиентам">
        <h2 className="staff-notif-settings__title">От клиентов</h2>
        {status === 'loading' && !items.length ? (
          <p className="client-me-muted">Загружаем…</p>
        ) : !items.length ? (
          <p className="os-empty-card__hint">Пока тихо. Здесь появятся задания и рационы, которые ждут открытия или уже открыты клиентом.</p>
        ) : (
          <ol className="client-inbox">
            {items.map((it, i) => {
              const fresh = !it.read_at
              return (
                <li key={it.id} style={{ '--i': i }}>
                  <Link to={it.deep_link} className={`client-inbox__row${fresh ? ' client-inbox__row--new' : ''}`}>
                    <span className="client-inbox__icon" aria-hidden>
                      <NotifIcon kind={it.kind} />
                    </span>
                    <span className="client-inbox__body">
                      <strong>{it.title}</strong>
                      <small>{it.body}</small>
                    </span>
                    {fresh ? <span className="client-inbox__dot" aria-label="Ждёт" /> : null}
                    <ChevronRight size={18} className="client-inbox__go" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>
      <p className="staff-notif-hint">
        <Bell size={14} aria-hidden /> Сообщения клиентов — во вкладке «Сообщения», не здесь.
      </p>
    </div>
  )
}
