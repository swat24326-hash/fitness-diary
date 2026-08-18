import { Dumbbell } from 'lucide-react'
import { ClientDiaries } from '../../components/ClientDiaries'
import { isOpenPnkClient, isPnkCardTabVisible } from '../../lib/pnk/pnkStagesCore.js'
import { ClientHomeworkPage } from './ClientHomeworkPage'
import { ClientLoyaltySection } from '../../components/loyalty/ClientLoyaltySection.jsx'
import { ClientNutritionPage } from './ClientNutritionPage'
import { ClientOverview } from './ClientOverview'
import { Statistics } from './Statistics'

const CARD_TABS = [
  { id: 'health', label: 'Здоровье и обмеры' },
  { id: 'nutrition', label: 'Питание' },
  { id: 'homework', label: 'ДЗ' },
  { id: 'memberships', label: 'Абонементы' },
  { id: 'diaries', label: 'Тренировки' },
  { id: 'loyalty', label: 'Баллы' },
  { id: 'stats', label: 'Статистика' },
]

function tabOk(client, tabId, ctx) {
  return !isOpenPnkClient(client) || isPnkCardTabVisible(client, tabId, ctx)
}

/**
 * Вкладки полной карточки ПЗ (логика баллов — в ClientLoyaltySection).
 */
export function ClientCardMainTabs({
  client,
  tab,
  setTab,
  healthCard,
  bzCompletedCount,
  isArchived,
  isSalesManager,
  canManageClubClients,
  isAdmin,
  reloadLocal,
  onNutritionPlanSaved,
  markPnkHomeworkIssued,
  pnkCloseMemberships,
  startPnkTraining,
  adminClubQs,
}) {
  const pnkCtx = { healthCard, bzCompletedCount }
  return (
    <>
      <div className="tabs" role="tablist">
        {CARD_TABS.filter((t) => isPnkCardTabVisible(client, t.id, pnkCtx)).map((t) => (
          <button
            key={t.id}
            type="button"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' && tabOk(client, 'health', pnkCtx) && (
        <ClientOverview
          client={client}
          onReload={reloadLocal}
          section="health"
          readOnly={isArchived || isSalesManager}
        />
      )}
      {tab === 'nutrition' && tabOk(client, 'nutrition', pnkCtx) && (
        <ClientNutritionPage
          client={client}
          readOnly={isArchived}
          onPlanSaved={isOpenPnkClient(client) && !isArchived ? onNutritionPlanSaved : undefined}
        />
      )}
      {tab === 'homework' && tabOk(client, 'homework', pnkCtx) && (
        <ClientHomeworkPage
          client={client}
          readOnly={isArchived}
          onHomeworkIssued={isOpenPnkClient(client) && !isArchived ? markPnkHomeworkIssued : undefined}
        />
      )}
      {tab === 'memberships' && tabOk(client, 'memberships', pnkCtx) && (
        <ClientOverview
          client={client}
          onReload={reloadLocal}
          section="memberships"
          readOnly={isArchived}
          membershipAutoOpen={pnkCloseMemberships && !isArchived}
          membershipPreferPaid={pnkCloseMemberships}
          showPaidAmount={canManageClubClients}
          membershipHall="pz"
        />
      )}
      {tab === 'loyalty' && tabOk(client, 'loyalty', pnkCtx) && <ClientLoyaltySection client={client} />}
      {tab === 'stats' && tabOk(client, 'stats', pnkCtx) && <Statistics clientId={client.id} />}
      {tab === 'diaries' && tabOk(client, 'diaries', pnkCtx) && (
        <>
          {isOpenPnkClient(client) && !isArchived && !canManageClubClients ? (
            <div className="pnk-conduct-banner" style={{ marginBottom: 12 }}>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.92rem' }}>
                Здесь список уже проведённых. Чтобы записать упражнения — нажмите кнопку.
              </p>
              <button type="button" className="btn btn-primary btn-touch" onClick={() => void startPnkTraining()}>
                <Dumbbell size={18} aria-hidden style={{ marginRight: 8, verticalAlign: -3 }} />
                Начать тренировку — записать упражнения
              </button>
            </div>
          ) : null}
          <ClientDiaries
            client={client}
            onDataChange={reloadLocal}
            clubQs={isAdmin ? adminClubQs : ''}
            readOnly={isArchived}
          />
        </>
      )}
    </>
  )
}
