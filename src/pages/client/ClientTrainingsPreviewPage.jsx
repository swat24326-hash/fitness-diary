/**
 * DEV: вкладка «Тренировки» без логина.
 * /me/trainings-preview — только ПЗ
 * /me/trainings-preview?mixed=1 — ПЗ + АЗ + ТЗ (макет канона, не прод)
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { membershipTrainingsCards } from '../../lib/client/clientMembershipVisitsUiCore.js'
import {
  clientMeHomePreviewSample,
  clientMeTrainingsMixedPreviewSample,
} from '../../lib/client/clientMeProgressPreviewSample.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'

function TrainingRows({ rows, desk }) {
  if (!rows.length) {
    return <p className="client-me-line">По этому абонементу тренировок ещё не было.</p>
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
            <small>{desk && !r.noShow ? `${r.meta} · у стойки` : r.meta}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Card({ card, desk = false, emptyHint = null }) {
  return (
    <section className="client-me-card">
      <h2 className="client-me-card__title">
        {card.title} <span className="client-me-muted">{card.period}</span>
      </h2>
      <p className="client-me-muted">{card.summary}</p>
      {emptyHint && !card.rows.length ? (
        <p className="client-me-line">{emptyHint}</p>
      ) : (
        <TrainingRows rows={card.rows} desk={desk} />
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
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  const data = mixed ? clientMeTrainingsMixedPreviewSample() : clientMeHomePreviewSample()
  const cards = membershipTrainingsCards(data.memberships)

  return (
    <ClientMeShell club={data.club} tabs>
      <p className="client-me-offline" role="note">
        {mixed
          ? 'Превью: ПЗ + два АЗ (Бокс и Степ) + ТЗ · макет · не прод'
          : 'Превью «Тренировки» · только ПЗ · локально'}
      </p>
      <ClientPageTitle title="Тренировки по абонементу" back={false} />
      {mixed ? (
        <p className="client-me-muted" style={{ marginTop: 0 }}>
          Несколько направлений АЗ — отдельные карточки. ПЗ: дневник. АЗ: списания у стойки. ТЗ: только срок.
        </p>
      ) : null}
      {cards.map((card) => {
        const hall = data.memberships.current.find((m) => card.title === m.label)?.hall
        if (hall === 'tz') {
          return (
            <Card
              key={card.key}
              card={{ ...card, summary: `Действует до ${card.period.split(' – ')[1] || '—'} · без списания занятий` }}
              emptyHint="В тренажёрном зале пока нет журнала визитов в приложении — только срок абонемента."
            />
          )
        }
        return <Card key={card.key} card={card} desk={hall === 'az'} />
      })}
    </ClientMeShell>
  )
}
