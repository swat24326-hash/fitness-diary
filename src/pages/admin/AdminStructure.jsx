import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Apple,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Gauge,
  Gift,
  Library,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  UtensilsCrossed,
  Users,
  Wallet,
} from 'lucide-react'
import { AdminOrganization } from './AdminOrganization'
import { AdminExercises } from './AdminExercises'
import { AdminMembershipTypes } from './AdminMembershipTypes'
import { AdminSalesManagers } from './AdminSalesManagers'
import { AdminSupervisors } from './AdminSupervisors'
import { AdminNutritionProducts } from './AdminNutritionProducts'
import { AdminNutritionRecipes } from './AdminNutritionRecipes.jsx'
import { AdminHomeworkPresets } from './AdminHomeworkPresets'
import { AdminHomeworkLibrary } from './AdminHomeworkLibrary.jsx'
import { AdminMaxOutreach } from './AdminMaxOutreach'
import { AdminCoachQualitySettings } from './AdminCoachQualitySettings'
import { AdminClubPlanSettings } from './AdminClubPlanSettings'
import { AdminIskraSettings } from './AdminIskraSettings'
import { AdminLoyaltySettings } from './AdminLoyaltySettings.jsx'

const TAB_IDS = [
  'clubs',
  'trainers',
  'sales-managers',
  'supervisors',
  'membership-types',
  'club-plan',
  'loyalty',
  'nutrition-products',
  'nutrition-recipes',
  'homework-presets',
  'homework-library',
  'exercises',
  'max-messages',
  'coach-quality',
  'iskra-settings',
]

const TABS = [
  { id: 'clubs', label: 'Клубы', Icon: Building2 },
  { id: 'trainers', label: 'Тренеры', Icon: Users },
  { id: 'sales-managers', label: 'Менеджеры', Icon: Briefcase },
  { id: 'supervisors', label: 'Управляющие', Icon: Shield },
  { id: 'membership-types', label: 'Типы абон.', Icon: CreditCard },
  { id: 'club-plan', label: 'План ЗП', Icon: Wallet },
  { id: 'loyalty', label: 'Лояльность', Icon: Gift },
  { id: 'nutrition-products', label: 'Питание', Icon: Apple },
  { id: 'nutrition-recipes', label: 'Рецепты', Icon: UtensilsCrossed },
  { id: 'homework-presets', label: 'ДЗ', Icon: ClipboardList },
  { id: 'homework-library', label: 'Библиотека ДЗ', Icon: Library },
  { id: 'exercises', label: 'Упражнения', Icon: Dumbbell },
  { id: 'max-messages', label: 'Max и SMS', Icon: MessageSquare },
  { id: 'coach-quality', label: 'Качество ведения', Icon: Gauge },
  { id: 'iskra-settings', label: 'ИСКРА', Icon: Sparkles },
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
        <div className="admin-structure__title-row">
          <Settings size={22} aria-hidden className="admin-structure__title-icon" />
          <h1 className="admin-structure__title">Настройки</h1>
        </div>
      </header>

      <div className="admin-structure__body">
        <div className="admin-structure__nav-slot">
          <nav
            className="admin-structure__nav"
            role="tablist"
            aria-label="Разделы настроек"
            aria-orientation="vertical"
          >
            {TABS.map((t) => {
              const Icon = t.Icon
              const selected = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="admin-structure__nav-btn"
                  aria-selected={selected}
                  aria-label={t.label}
                  id={`admin-structure-tab-${t.id}`}
                  aria-controls={`admin-structure-panel-${t.id}`}
                  title={t.label}
                  onClick={() => setTab(t.id)}
                >
                  <Icon className="admin-structure__nav-icon" size={18} aria-hidden />
                  <span className="admin-structure__nav-label">{t.label}</span>
                </button>
              )
            })}
          </nav>
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
            id="admin-structure-panel-supervisors"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-supervisors"
            hidden={tab !== 'supervisors'}
            className="admin-structure__panel"
          >
            {tab === 'supervisors' ? <AdminSupervisors /> : null}
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
            id="admin-structure-panel-club-plan"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-club-plan"
            hidden={tab !== 'club-plan'}
            className="admin-structure__panel"
          >
            {tab === 'club-plan' ? <AdminClubPlanSettings /> : null}
          </div>
          <div
            id="admin-structure-panel-loyalty"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-loyalty"
            hidden={tab !== 'loyalty'}
            className="admin-structure__panel"
          >
            {tab === 'loyalty' ? <AdminLoyaltySettings /> : null}
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
            id="admin-structure-panel-nutrition-recipes"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-nutrition-recipes"
            hidden={tab !== 'nutrition-recipes'}
            className="admin-structure__panel"
          >
            {tab === 'nutrition-recipes' ? <AdminNutritionRecipes /> : null}
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
            id="admin-structure-panel-homework-library"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-homework-library"
            hidden={tab !== 'homework-library'}
            className="admin-structure__panel"
          >
            {tab === 'homework-library' ? <AdminHomeworkLibrary /> : null}
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
          <div
            id="admin-structure-panel-coach-quality"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-coach-quality"
            hidden={tab !== 'coach-quality'}
            className="admin-structure__panel"
          >
            {tab === 'coach-quality' ? <AdminCoachQualitySettings /> : null}
          </div>
          <div
            id="admin-structure-panel-iskra-settings"
            role="tabpanel"
            aria-labelledby="admin-structure-tab-iskra-settings"
            hidden={tab !== 'iskra-settings'}
            className="admin-structure__panel"
          >
            {tab === 'iskra-settings' ? <AdminIskraSettings /> : null}
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Открыта вкладка: {tabLabel}
      </p>
    </div>
  )
}
