import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { TrainingViewModal } from '../../components/trainer/TrainingViewModal.jsx'
import { recentTrainingRow, recentTrainingsSummary, trainingViewTitle } from '../../lib/client/clientTrainingsUiCore.js'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientMe } from './useClientMe.js'
import { useClientTraining } from './useClientTraining.js'

/** /me/trainings — тренировки клиента за 30 дней; нажатие открывает окно «что делали» (без заметок тренера). */
export function ClientTrainingsPage() {
  const navigate = useNavigate()
  const { data, status, logout } = useClientMe()
  const view = useClientTraining()
  if (status === 'signed_out') return <Navigate to="/me" replace />
  const list = data?.recent_trainings

  const actions = (
    <span className="client-me__actions">
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={() => navigate('/me')}
        title="Назад"
        aria-label="Назад"
      >
        <ArrowLeft size={20} aria-hidden />
      </button>
      <ClientMenu clientName={data?.client?.name || ''} onLogout={() => void logout()} />
    </span>
  )

  return (
    <ClientMeShell actions={actions} club={data?.club ?? null}>
      <h1 className="client-me__hello">Мои тренировки</h1>
      {status === 'offline' ? (
        <p className="client-me-offline" role="status">
          Нет связи — показаны сохранённые данные
        </p>
      ) : null}
      {!list ? (
        <ClientMeStatus icon={RefreshCw} spin={status === 'loading'} title={status === 'loading' ? 'Загружаем…' : 'Нет данных'} />
      ) : (
        <section className="client-me-card">
          <p className="client-me-muted">{recentTrainingsSummary(list)}</p>
          {view.error ? (
            <p className="client-me-offline" role="alert">
              {view.error}
            </p>
          ) : null}
          {list.length ? (
            <ol className="client-trainings">
              {list.map((t, i) => {
                const r = recentTrainingRow(t, data.as_of)
                const content = (
                  <>
                    <span className="client-trainings__date" aria-hidden>
                      <strong>{r.num}</strong>
                      <small>{r.weekday}</small>
                    </span>
                    <span className="client-trainings__body">
                      <strong>{r.title}</strong>
                      <small>{r.meta}</small>
                    </span>
                  </>
                )
                return (
                  <li
                    key={t.id || `${t.date}-${i}`}
                    className={`client-trainings__row${r.noShow ? ' client-trainings__row--miss' : ''}`}
                    style={{ '--i': i }}
                  >
                    {r.canOpen ? (
                      <button
                        type="button"
                        className="client-trainings__open"
                        onClick={() => void view.open(t.id)}
                        aria-busy={view.pendingId === t.id}
                      >
                        {content}
                        {view.pendingId === t.id ? (
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
              })}
            </ol>
          ) : (
            <p className="client-me-line">За последние 30 дней тренировок не было.</p>
          )}
        </section>
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
