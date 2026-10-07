import { CalendarClock, Gift, IdCard, TrendingUp } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  formatSessionDayRu,
  formatSignedRu,
  measurementDeltas,
  membershipStatusLineRu,
  pointsWord,
  trainingsWord,
} from '../../lib/client/clientMeUiCore.js'

function Card({ icon: Icon, title, children }) {
  return (
    <section className="client-me-card">
      <h2 className="client-me-card__title">
        <Icon size={18} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

export function ClientMembershipsCard({ memberships, today }) {
  const current = memberships?.current ?? []
  return (
    <Card icon={IdCard} title="Мой абонемент">
      {current.length ? (
        current.map((m, i) => (
          <div key={`${m.start_date}-${i}`} className={`client-me-mem client-me-mem--${m.status}`}>
            <div className="client-me-mem__head">
              <span className="client-me-mem__label">{m.label}</span>
              {m.total != null ? (
                <span className="client-me-mem__left">
                  осталось <strong>{m.remaining}</strong> из {m.total}
                </span>
              ) : null}
            </div>
            {m.total != null ? (
              <div className="client-me-bar" aria-hidden>
                <span style={{ width: `${Math.min(100, (m.used / Math.max(1, m.total)) * 100)}%` }} />
              </div>
            ) : null}
            <p className="client-me-muted">{membershipStatusLineRu(m, today)}</p>
          </div>
        ))
      ) : memberships?.last_ended ? (
        <p className="client-me-muted">
          {memberships.last_ended.label} закончился {formatDateRu(memberships.last_ended.end_date)}. Продлить можно в клубе.
        </p>
      ) : (
        <p className="client-me-muted">Абонемента пока нет.</p>
      )}
    </Card>
  )
}

export function ClientNextSessionCard({ session, today }) {
  return (
    <Card icon={CalendarClock} title="Следующая тренировка">
      {session ? (
        <div className="client-me-next">
          <span className="client-me-next__day">{formatSessionDayRu(session.date, today)}</span>
          <span className="client-me-next__time">{session.time}</span>
          {session.trainer_name ? <span className="client-me-muted">Тренер: {session.trainer_name}</span> : null}
        </div>
      ) : (
        <p className="client-me-muted">Пока не запланирована — договоритесь с тренером.</p>
      )}
    </Card>
  )
}

export function ClientProgressCard({ progress }) {
  const p = progress ?? {}
  const weights = p.weights ?? []
  const firstW = weights[0]
  const lastW = weights.at(-1)
  const deltas = measurementDeltas(p.measurements)
  return (
    <Card icon={TrendingUp} title="Мой прогресс">
      <div className="client-me-stats">
        <div>
          <strong>{p.visits_total ?? 0}</strong>
          <span>{trainingsWord(p.visits_total ?? 0)} всего</span>
        </div>
        <div>
          <strong>{p.visits_30d ?? 0}</strong>
          <span>за 30 дней</span>
        </div>
      </div>
      {p.last_visit ? <p className="client-me-muted">Последняя тренировка: {formatDateRu(p.last_visit)}</p> : null}
      {lastW ? (
        <p className="client-me-line">
          Вес: <strong>{String(lastW.kg).replace('.', ',')} кг</strong>
          {firstW && firstW !== lastW ? (
            <span className="client-me-muted">
              {' '}
              ({formatSignedRu(lastW.kg - firstW.kg, 'кг')} с {formatDateRu(firstW.date)})
            </span>
          ) : null}
        </p>
      ) : null}
      {deltas.length ? (
        <ul className="client-me-deltas">
          {deltas.map((d) => (
            <li key={d.id}>
              <span>{d.label}</span>
              <span>
                {String(d.to).replace('.', ',')} см <em className="client-me-muted">{formatSignedRu(d.diff, 'см')}</em>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

export function ClientLoyaltyCard({ loyalty }) {
  if (!loyalty) return null
  return (
    <Card icon={Gift} title="Бонусы">
      <p className="client-me-line">
        <strong className="client-me-points">{loyalty.points}</strong> {pointsWord(loyalty.points)}
      </p>
      <p className="client-me-muted">
        {loyalty.can_redeem
          ? 'Можно забрать на стойке клуба'
          : loyalty.unlock_on && loyalty.enabled
            ? `Забрать можно с ${formatDateRu(loyalty.unlock_on)}`
            : 'Программа сейчас на паузе — баллы сохранены'}
      </p>
    </Card>
  )
}
