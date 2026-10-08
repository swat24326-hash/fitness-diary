import { Navigate } from 'react-router-dom'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { TrainingViewModal } from '../../components/trainer/TrainingViewModal.jsx'
import { membershipTrainingsCards } from '../../lib/client/clientMembershipVisitsUiCore.js'
import { trainingViewTitle } from '../../lib/client/clientTrainingsUiCore.js'
import { ClientBackActions } from './ClientBackActions.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientMe } from './useClientMe.js'
import { useClientTraining } from './useClientTraining.js'

function TrainingRow({ row, index, view }) {
  const content = (
    <>
      <span className="client-trainings__date" aria-hidden>
        <strong>{row.num}</strong>
        <small>{row.month}</small>
      </span>
      <span className="client-trainings__body">
        <strong>{row.title}</strong>
        <small>{row.meta}</small>
      </span>
    </>
  )
  const id = row.training.id
  return (
    <li className={`client-trainings__row${row.noShow ? ' client-trainings__row--miss' : ''}`} style={{ '--i': index }}>
      {row.canOpen ? (
        <button type="button" className="client-trainings__open" onClick={() => void view.open(id)} aria-busy={view.pendingId === id}>
          {content}
          {view.pendingId === id ? (
            <RefreshCw size={18} className="client-trainings__go client-me-spin" aria-label="Открываем" />
          ) : (
            <ChevronRight size={18} className="client-trainings__go" aria-hidden />
          )}
        </button>
      ) : (
        content
      )}
    </li>
  )
}

/** /me/trainings — тренировки по абонементу: что списано (включая неявки), нажатие открывает окно «что делали». */
export function ClientTrainingsPage() {
  const { data, status } = useClientMe()
  const view = useClientTraining()
  if (status === 'signed_out') return <Navigate to="/me" replace />
  const cards = data ? membershipTrainingsCards(data.memberships) : null

  return (
    <ClientMeShell actions={<ClientBackActions />} club={data?.club ?? null}>
      <h1 className="client-me__hello">Тренировки по абонементу</h1>
      {status === 'offline' ? (
        <p className="client-me-offline" role="status">
          Нет связи — показаны сохранённые данные
        </p>
      ) : null}
      {view.error ? (
        <p className="client-me-offline" role="alert">
          {view.error}
        </p>
      ) : null}
      {!cards ? (
        <ClientMeStatus icon={RefreshCw} spin={status === 'loading'} title={status === 'loading' ? 'Загружаем…' : 'Нет данных'} />
      ) : cards.length ? (
        cards.map((card) => (
          <section key={card.key} className="client-me-card">
            <h2 className="client-me-card__title">
              {card.title} <span className="client-me-muted">{card.period}</span>
            </h2>
            <p className="client-me-muted">{card.summary}</p>
            {card.rows.length ? (
              <ol className="client-trainings">
                {card.rows.map((r, i) => (
                  <TrainingRow key={r.training.id || r.n} row={r} index={i} view={view} />
                ))}
              </ol>
            ) : (
              <p className="client-me-line">По этому абонементу тренировок ещё не было.</p>
            )}
            {card.gap ? (
              <p className="client-me-renew" role="note">
                {card.gap}
              </p>
            ) : null}
          </section>
        ))
      ) : (
        <ClientMeStatus title="Абонемента пока нет" hint="Купить абонемент можно у администратора клуба." />
      )}
      {view.training ? (
        <TrainingViewModal
          training={view.training}
          trainerName={view.training.trainer_name || undefined}
          dateLabel={trainingViewTitle(view.training.date)}
          onClose={view.close}
        />
      ) : null}
    </ClientMeShell>
  )
}
