import { BarChart3, CalendarClock, Flame, Gift, IdCard, TrendingUp } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import {
  lastVisitWidget,
  measurementDeltas,
  pointsWord,
  weeksStreakLabel,
  weightDeltaWidget,
} from '../../lib/client/clientMeUiCore.js'
import { membershipNote, membershipTile, sessionTile } from '../../lib/client/clientMeTilesCore.js'
import { ClientMeasuresFold } from './ClientMeasuresFold.jsx'
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

/** Плитка: заголовок → значение → подпись → meta (полоска) → подвал. Одинаковые слоты на обеих. */
function Tile({ icon: Icon, title, lead, tile }) {
  return (
    <section className={`client-me-card client-me-tile client-me-tile--${tile.tone}${lead ? ' client-me-card--lead' : ''}`}>
      <h2 className="client-me-card__title">
        <Icon size={16} aria-hidden />
        <span className="client-me-tile__title-text">{title}</span>
      </h2>
      <div className="client-me-tile__body">
        <span className="client-me-tile__hero">
          {tile.hero}
          {tile.unit ? <small>{tile.unit}</small> : null}
        </span>
        <span className="client-me-tile__caption">{tile.caption}</span>
      </div>
      <div className="client-me-tile__meta" aria-hidden>
        {tile.bar != null ? (
          <div className="client-me-bar">
            <span style={{ width: `${tile.bar}%` }} />
          </div>
        ) : null}
      </div>
      <p className="client-me-tile__foot">{tile.foot}</p>
    </section>
  )
}

export function ClientMembershipsCard({ memberships, today, lead }) {
  return <Tile icon={IdCard} title="Мой абонемент" lead={lead} tile={membershipTile(memberships, today)} />
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

/** «Мой прогресс» — график веса и обмеры (обмеры свёрнуты в кнопку). Ни веса, ни замеров — карточки нет. */
export function ClientProgressCard({ progress, sparkBuild = 0, sparkSettling = false }) {
  const p = progress ?? {}
  const weights = p.weights ?? []
  const hasMeasures = measurementDeltas(p.measurements).length > 0
  if (!weights.length && !hasMeasures) return null
  return (
    <Card icon={TrendingUp} title="Мой прогресс">
      <ClientWeightSpark key={sparkBuild} weights={weights} settling={sparkSettling} rebuilt={sparkBuild > 0} />
      <ClientMeasuresFold measurements={p.measurements} />
    </Card>
  )
}

/** Цифры под «Моим прогрессом»: тренировки всего / за 30 дней, последняя, изменение веса, недели подряд. */
export function ClientStatsCard({ progress }) {
  const p = progress ?? {}
  const last = lastVisitWidget(p.last_visit)
  const weightDelta = weightDeltaWidget(p.weights ?? [])
  const streak = weeksStreakLabel(p.weeks_streak)
  return (
    <Card icon={BarChart3} title="Мои тренировки">
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
