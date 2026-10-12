import { Navigate } from 'react-router-dom'
import { ChevronRight, Dumbbell, RefreshCw, Salad, WifiOff } from 'lucide-react'
import { clientHomeworkTitle, planFootRu } from '../../lib/client/clientPlanUiCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientPlanSwitch } from './ClientPlanSwitch.jsx'
import { ClientHomeworkView, ClientNutritionView } from './ClientPlanViews.jsx'
import { useClientPlans } from './useClientPlans.js'

function History({ items, currentId, openingId, onOpen }) {
  if (items.length < 2) return null
  return (
    <section className="client-me-card">
      <h2 className="client-me-card__title">Прошлые</h2>
      <ol className="client-trainings">
        {items.map((it, i) => (
          <li key={it.id} className="client-trainings__row" style={{ '--i': i }}>
            <button
              type="button"
              className="client-trainings__open"
              onClick={() => onOpen(it.id)}
              aria-current={it.id === currentId ? 'true' : undefined}
              aria-busy={openingId === it.id}
            >
              <span className="client-trainings__body">
                <strong>
                  {it.kind === 'nutrition' ? `${Math.round(Number(it.summary?.kcal) || 0)} ккал` : clientHomeworkTitle(it.summary?.title)}
                  {it.id === currentId ? <span className="client-plan__current"> · открыто</span> : null}
                </strong>
                <small>{planFootRu(it)}</small>
              </span>
              <ChevronRight size={18} className="client-trainings__go" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Вкладка «От тренера»: /me/task и /me/nutrition — последнее сверху, ниже прошлые. Без сети — последнее открытое. */
export function ClientPlanPage({ kind }) {
  const plans = useClientPlans(kind)
  if (plans.status === 'signed_out') return <Navigate to="/me" replace />
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <ClientMeShell
      actions={<ClientPageActions onRefresh={plans.reload} refreshing={plans.status === 'loading'} />}
      club={readClientMeCache()?.data?.club ?? null}
      tabs
    >
      <ClientPageTitle title="От тренера" back={false} />
      <ClientPlanSwitch />
      {plans.offline ? (
        <p className="client-me-offline" role="status">
          Нет связи — показано последнее загруженное
        </p>
      ) : null}
      {plans.error && plans.status !== 'error' ? (
        <p className="client-me-offline" role="alert">
          {plans.error}
        </p>
      ) : null}
      {plans.status === 'loading' && !plans.item ? <ClientMeStatus icon={RefreshCw} spin title="Загружаем…" /> : null}
      {plans.status === 'error' ? <ClientMeStatus icon={WifiOff} title="Нет связи" hint={plans.error} /> : null}
      {plans.status === 'empty' ? (
        <ClientMeStatus
          icon={kind === 'nutrition' ? Salad : Dumbbell}
          title={kind === 'nutrition' ? 'Рациона пока нет' : 'Заданий пока нет'}
          hint="Когда тренер пришлёт, оно появится здесь и придёт уведомление."
        />
      ) : null}
      {plans.item ? kind === 'nutrition' ? <ClientNutritionView item={plans.item} /> : <ClientHomeworkView item={plans.item} /> : null}
      <History
        items={plans.items}
        currentId={plans.item?.id}
        openingId={plans.openingId}
        onOpen={(id) => {
          scrollTop()
          plans.open(id)
        }}
      />
    </ClientMeShell>
  )
}
