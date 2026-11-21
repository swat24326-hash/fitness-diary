import { Navigate, useSearchParams } from 'react-router-dom'
import { clubFoodDiaryEnabled } from '../../lib/client/foodDiaryClubCore.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientFoodDiaryView, foodDiaryPreviewSample } from './ClientFoodDiaryView.jsx'
import { CLIENT_NUTRITION_PREVIEW_ITEM } from '../../lib/client/clientNutritionPreviewSample.js'
import { useClientMe } from './useClientMe.js'
import { clientAttention } from './ClientTabs.jsx'

/** /me/food-diary — дневник калорий; только если клуб включил модуль. */
export function ClientFoodDiaryPage() {
  const { data, status, error } = useClientMe()

  if (status === 'signed_out') {
    return <Navigate to={CLIENT_HOME} replace />
  }

  if (!data) {
    return (
      <ClientMeShell tabs>
        {status === 'offline' ? (
          <ClientMeStatus title="Нет связи" hint={error} />
        ) : (
          <ClientMeStatus title="Загружаем…" />
        )}
      </ClientMeShell>
    )
  }

  if (!clubFoodDiaryEnabled(data.club)) {
    return <Navigate to={CLIENT_HOME} replace />
  }

  return (
    <ClientFoodDiaryView
      club={data.club}
      client={data.client}
      memberships={data.memberships}
      attention={clientAttention(data)}
      asOf={data.as_of}
    />
  )
}

/** DEV: /me/food-diary-preview — день с примером, без логина. `?az=1` — как АЗ/ТЗ без Рациона. */
export function ClientFoodDiaryPreviewPage() {
  const [params] = useSearchParams()
  if (!import.meta.env.DEV) return <Navigate to={CLIENT_HOME} replace />
  const asOf = '2026-11-21'
  const az = params.get('az') === '1'
  return (
    <ClientFoodDiaryView
      club={{ name: 'Fit City', food_diary_enabled: true }}
      note={az ? 'Превью дневника · АЗ/ТЗ · без логина' : 'Превью дневника · ПЗ: вкладка Рацион · без логина'}
      asOf={asOf}
      previewDay={foodDiaryPreviewSample(asOf)}
      localOnly
      previewShowRation={!az}
      previewRationItem={az ? null : CLIENT_NUTRITION_PREVIEW_ITEM}
    />
  )
}
