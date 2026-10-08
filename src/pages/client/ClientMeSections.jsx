import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, Flame, Gift, IdCard, ListChecks, TrendingUp } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  formatSignedRu,
  lastVisitWidget,
  measurementDeltas,
  pointsWord,
  weeksStreakLabel,
  weightDeltaWidget,
} from '../../lib/client/clientMeUiCore.js'
import { membershipNote, membershipTile, sessionTile } from '../../lib/client/clientMeTilesCore.js'
import { ClientWeightSpark } from './ClientWeightSpark.jsx'

function Card({ icon: Icon, title, lead = false, children }) {
  return (
    <section className={lead ? 'client-me-card client-me-card--lead' : 'client-me-card'}>
      <h2 className="client-me-card__title">
        <Icon size={18} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Квадратная плитка: заголовок → крупное значение → подпись → подвал. Одна схема для симметрии. */
function Tile({ icon: Icon, title, lead, tile, children }) {
  return (
    <section className={`client-me-card client-me-tile client-me-tile--${tile.tone}${lead ? ' client-me-card--lead' : ''}`}>
      <h2 className="client-me-card__title">
        <Icon size={18} aria-hidden />
        {title}
      </h2>
      <div className="client-me-tile__body">
        <span className="client-me-tile__hero">
          {tile.hero}
          {tile.unit ? <small>{tile.unit}</small> : null}
        </span>
        <span className="client-me-tile__caption">{tile.caption}</span>
      </div>
      <div className="client-me-tile__foot">
        {children}
        <span>{tile.foot}</span>
      </div>
    </section>
  )
}

export function ClientMembershipsCard({ memberships, today, lead }) {
  const tile = membershipTile(memberships, today)
  return (
    <Tile icon={IdCard} title="Мой абонемент" lead={lead} tile={tile}>
      {tile.bar != null ? (
        <div className="client-me-bar" aria-hidden>
          <span style={{ width: `${tile.bar}%` }} />
        </div>
      ) : null}
    </Tile>
  )
}

export function ClientNextSessionCard({ session, today, lead }) {
  return <Tile icon={CalendarClock} title="Следующая тренировка" lead={lead} tile={sessionTile(session, today)} />
}

/** Под плитками: продлить или следующий абонемент уже куплен. */
export function ClientMembershipNote({ memberships }) {
  const note = membershipNote(memberships)
  return note ? (
    <p className="client-me-renew" role="note">
      {note}
    </p>
  ) : null
}

export function ClientProgressCard({ progress, sparkBuild = 0, sparkSettling = false }) {
  const p = progress ?? {}
  const last = lastVisitWidget(p.last_visit)
  const weights = p.weights ?? []
  const weightDelta = weightDeltaWidget(weights)
  const deltas = measurementDeltas(p.measurements)
  const streak = weeksStreakLabel(p.weeks_streak)
  return (
    <Card icon={TrendingUp} title="Мой прогресс">
      <div className="client-me-stats">
        <div>
          <strong>{p.visits_total ?? 0}</strong>
          <span>всего</span>
        </div>
        <div>
          <strong>{p.visits_30d ?? 0}</strong>
          <span>за 30 дней</span>
        </div>
        <div>
          <strong>{last.value}</strong>
          <span>{last.label}</span>
        </div>
        {weightDelta ? (
          <div aria-label={weightDelta.aria}>
            <strong aria-hidden>
              {weightDelta.sign ? <span className="client-me-stats__sign">{weightDelta.sign}</span> : null}
              {weightDelta.value}
              <small>{weightDelta.unit}</small>
            </strong>
            <span>{weightDelta.label}</span>
          </div>
        ) : null}
      </div>
      {streak ? (
        <p className="client-me-streak">
          <Flame size={16} aria-hidden />
          {streak}
        </p>
      ) : null}
      <Link to="/me/trainings" className="client-me-link">
        <ListChecks size={18} aria-hidden />
        <span>Тренировки по абонементу</span>
        <ChevronRight size={18} aria-hidden className="client-me-link__chevron" />
      </Link>
      <ClientWeightSpark key={sparkBuild} weights={weights} settling={sparkSettling} rebuilt={sparkBuild > 0} />
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
