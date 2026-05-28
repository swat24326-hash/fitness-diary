import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminOrganization } from './AdminOrganization'
import { AdminStatistics } from './AdminStatistics'
import { AdminMembershipTypes } from './AdminMembershipTypes'

const TAB_IDS = ['clubs', 'trainers', 'membership-types', 'statistics']

const TABS = [
  { id: 'clubs', label: 'Клубы' },
  { id: 'trainers', label: 'Тренеры' },
  { id: 'membership-types', label: 'Типы абон.' },
  { id: 'statistics', label: 'Статистика' },
]

export function AdminStructure() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tabRaw = searchParams.get('tab') ?? 'clubs'
  const tab = TAB_IDS.includes(tabRaw) ? tabRaw : 'clubs'

  const setTab = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams)
      if (id === 'clubs') next.delete('tab')
      else next.set('tab', id)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const tabLabel = useMemo(() => TABS.find((t) => t.id === tab)?.label ?? 'Клубы', [tab])

  return (
    <div className="admin-structure">
      <header className="admin-structure__header">
        <h1 className="admin-structure__title">Структура</h1>
        <p className="muted admin-structure__intro">Клубы, тренеры и статистика — в одном разделе. Выбранный в шапке клуб (<code className="muted">?club=</code>) используется в «Статистике».</p>
      </header>

      <div className="tabs admin-structure__tabs" role="tablist" aria-label="Структура клуба">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            id={`admin-structure-tab-${t.id}`}
            aria-controls={`admin-structure-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-structure__panel-wrap">
        <div
          id="admin-structure-panel-clubs"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-clubs"
          hidden={tab !== 'clubs'}
          className="admin-structure__panel"
        >
          {tab === 'clubs' ? <AdminOrganization mode="clubs" /> : null}
        </div>
        <div
          id="admin-structure-panel-trainers"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-trainers"
          hidden={tab !== 'trainers'}
          className="admin-structure__panel"
        >
          {tab === 'trainers' ? <AdminOrganization mode="trainers" /> : null}
        </div>
        <div
          id="admin-structure-panel-membership-types"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-membership-types"
          hidden={tab !== 'membership-types'}
          className="admin-structure__panel"
        >
          {tab === 'membership-types' ? <AdminMembershipTypes /> : null}
        </div>
        <div
          id="admin-structure-panel-statistics"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-statistics"
          hidden={tab !== 'statistics'}
          className="admin-structure__panel"
        >
          {tab === 'statistics' ? <AdminStatistics /> : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Открыта вкладка: {tabLabel}
      </p>
    </div>
  )
}
