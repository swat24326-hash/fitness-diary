import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminOrganization } from './AdminOrganization'
import { AdminExercises } from './AdminExercises'
import { AdminMembershipTypes } from './AdminMembershipTypes'
import { AdminSalesManagers } from './AdminSalesManagers'
import { AdminNutritionProducts } from './AdminNutritionProducts'
import { AdminHomeworkPresets } from './AdminHomeworkPresets'
import { AdminMaxOutreach } from './AdminMaxOutreach'

const TAB_IDS = [
  'clubs',
  'trainers',
  'sales-managers',
  'membership-types',
  'nutrition-products',
  'homework-presets',
  'exercises',
  'max-messages',
]

const TABS = [
  { id: 'clubs', label: 'Клубы' },
  { id: 'trainers', label: 'Тренеры' },
  { id: 'sales-managers', label: 'Менеджеры' },
  { id: 'membership-types', label: 'Типы абон.' },
  { id: 'nutrition-products', label: 'Питание' },
  { id: 'homework-presets', label: 'ДЗ' },
  { id: 'exercises', label: 'Упражнения' },
  { id: 'max-messages', label: 'Сообщения Max' },
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
        <p className="muted admin-structure__intro">Клубы, тренеры, справочники и тексты для Max — в одном разделе. Выбранный в шапке клуб (<code className="muted">?club=</code>) используется во вкладках ниже.</p>
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
          id="admin-structure-panel-sales-managers"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-sales-managers"
          hidden={tab !== 'sales-managers'}
          className="admin-structure__panel"
        >
          {tab === 'sales-managers' ? <AdminSalesManagers /> : null}
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
          id="admin-structure-panel-nutrition-products"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-nutrition-products"
          hidden={tab !== 'nutrition-products'}
          className="admin-structure__panel"
        >
          {tab === 'nutrition-products' ? <AdminNutritionProducts /> : null}
        </div>
        <div
          id="admin-structure-panel-homework-presets"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-homework-presets"
          hidden={tab !== 'homework-presets'}
          className="admin-structure__panel"
        >
          {tab === 'homework-presets' ? <AdminHomeworkPresets /> : null}
        </div>
        <div
          id="admin-structure-panel-exercises"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-exercises"
          hidden={tab !== 'exercises'}
          className="admin-structure__panel"
        >
          {tab === 'exercises' ? <AdminExercises /> : null}
        </div>
        <div
          id="admin-structure-panel-max-messages"
          role="tabpanel"
          aria-labelledby="admin-structure-tab-max-messages"
          hidden={tab !== 'max-messages'}
          className="admin-structure__panel"
        >
          {tab === 'max-messages' ? <AdminMaxOutreach /> : null}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Открыта вкладка: {tabLabel}
      </p>
    </div>
  )
}
