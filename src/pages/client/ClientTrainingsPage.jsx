import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { recentTrainingRow, recentTrainingsSummary } from '../../lib/client/clientTrainingsUiCore.js'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientMe } from './useClientMe.js'

/** /me/trainings — тренировки клиента за 30 дней: когда, что делали, с кем, вес; неявки с пометкой. */
export function ClientTrainingsPage() {
  const navigate = useNavigate()
  const { data, status, logout } = useClientMe()
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
          {list.length ? (
            <ol className="client-trainings">
              {list.map((t, i) => {
                const r = recentTrainingRow(t, data.as_of)
                return (
                  <li
                    key={`${t.date}-${i}`}
                    className={`client-trainings__row${r.noShow ? ' client-trainings__row--miss' : ''}`}
                    style={{ '--i': i }}
                  >
                    <span className="client-trainings__date" aria-hidden>
                      <strong>{r.num}</strong>
                      <small>{r.weekday}</small>
                    </span>
                    <span className="client-trainings__body">
                      <strong>{r.title}</strong>
                      <small>{r.meta}</small>
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="client-me-line">За последние 30 дней тренировок не было.</p>
          )}
        </section>
      )}
    </ClientMeShell>
  )
}
