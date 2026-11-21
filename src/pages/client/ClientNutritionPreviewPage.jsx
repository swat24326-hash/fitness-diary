/**
 * DEV: рацион на 7 дней без входа — чтобы смотреть кнопки дней на телефоне.
 * /me/nutrition-preview
 */
import { Navigate } from 'react-router-dom'
import { CLIENT_NUTRITION_PREVIEW_ITEM } from '../../lib/client/clientNutritionPreviewSample.js'
import { ClientNutritionView } from './ClientPlanViews.jsx'
import { ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'

export { CLIENT_NUTRITION_PREVIEW_ITEM }

export function ClientNutritionPreviewPage() {
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  return (
    <ClientMeShell tabs club={{ name: 'FIT-CITY' }}>
      <ClientPageTitle title="От тренера" back={false} />
      <ClientNutritionView item={CLIENT_NUTRITION_PREVIEW_ITEM} />
    </ClientMeShell>
  )
}
