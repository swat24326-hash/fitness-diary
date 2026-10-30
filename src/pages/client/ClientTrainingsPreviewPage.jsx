/**
 * DEV: вкладка «Тренировки» без логина.
 * /me/trainings-preview — только ПЗ
 * /me/trainings-preview?mixed=1 — ПЗ + АЗ + ТЗ (макет канона, не прод)
 * /me/trainings-preview?az=1 — чистый АЗ со списаниями у стойки
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { membershipTrainingsCards } from '../../lib/client/clientMembershipVisitsUiCore.js'
import {
  clientMeHomeAzPreviewSample,
  clientMeHomePreviewSample,
  clientMeTrainingsMixedPreviewSample,
} from '../../lib/client/clientMeProgressPreviewSample.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'

function TrainingRows({ rows }) {
  if (!rows.length) {
    return null
  }
  return (
    <ol className="client-trainings">
      {rows.map((r, i) => (
        <li
          key={r.training?.id || r.n || i}
          className={`client-trainings__row${r.noShow ? ' client-trainings__row--miss' : ''}`}
          style={{ '--i': i }}
        >
          <span className="client-trainings__date" aria-hidden>
            <strong>{r.num}</strong>
            <small>{r.month}</small>
          </span>
          <span className="client-trainings__body">
            <strong>{r.title}</strong>
            <small>{r.meta}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Card({ card }) {
  return (
    <section className="client-me-card">
      <h2 className="client-me-card__title">
        {card.title} <span className="client-me-muted">{card.period}</span>
      </h2>
      <p className="client-me-muted">{card.summary}</p>
      {card.rows.length ? (
        <TrainingRows rows={card.rows} />
      ) : (
        <p className="client-me-line">{card.emptyHint || 'По этому абонементу тренировок ещё не было.'}</p>
      )}
      {card.gap ? (
        <p className="client-me-renew" role="note">
          {card.gap}
        </p>
      ) : null}
    </section>
  )
}

export function ClientTrainingsPreviewPage() {
  const [params] = useSearchParams()
  const mixed = params.get('mixed') === '1'
  const pureAz = params.get('az') === '1'
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  const data = pureAz
    ? clientMeHomeAzPreviewSample()
    : mixed
      ? clientMeTrainingsMixedPreviewSample()
      : clientMeHomePreviewSample()
  const cards = membershipTrainingsCards(data.memberships)
  const note = pureAz
    ? 'Превью: чистый АЗ · списания у стойки · без окна подходов · макет'
    : mixed
      ? 'Превью: ПЗ + два АЗ (Бокс и Степ) + ТЗ · макет · не прод'
      : 'Превью «Тренировки» · только ПЗ · локально'

  return (
    <ClientMeShell club={data.club} tabs showFromTrainer={!pureAz}>
      <p className="client-me-offline" role="note">
        {note}
      </p>
      <ClientPageTitle title="Тренировки по абонементу" back={false} />
      {mixed || pureAz ? (
        <p className="client-me-muted" style={{ marginTop: 0 }}>
          {pureAz
            ? 'АЗ: списания у стойки, окно подходов не открывается.'
            : 'Несколько направлений АЗ — отдельные карточки. ПЗ: дневник. АЗ: списания у стойки. ТЗ: только срок.'}
        </p>
      ) : null}
      {cards.map((card) => (
        <Card key={card.key} card={card} />
      ))}
    </ClientMeShell>
  )
}
