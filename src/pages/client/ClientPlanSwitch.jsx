import { useLocation } from 'react-router-dom'
import { Dumbbell, Salad } from 'lucide-react'
import { CLIENT_PLAN_ROUTES, CLIENT_PLAN_TITLES, clientPlanFresh } from '../../lib/client/clientPlanUiCore.js'
import { clubFoodDiaryEnabled } from '../../lib/client/foodDiaryClubCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientSegments } from './ClientSegments.jsx'

const ICONS = { homework: Dumbbell, nutrition: Salad }

/** Переключатель внутри вкладки «От тренера»: задание ↔ питание. При дневнике — только задание. */
export function ClientPlanSwitch() {
  const { pathname } = useLocation()
  const cached = readClientMeCache()?.data
  const plans = cached?.plans
  const diaryOn = clubFoodDiaryEnabled(cached?.club)
  const kinds = diaryOn ? ['homework'] : Object.keys(CLIENT_PLAN_ROUTES)
  if (kinds.length === 1) return null
  const items = kinds.map((kind) => ({
    key: kind,
    to: CLIENT_PLAN_ROUTES[kind],
    label: CLIENT_PLAN_TITLES[kind],
    icon: ICONS[kind],
    active: pathname === CLIENT_PLAN_ROUTES[kind],
    dot: clientPlanFresh(plans, kind),
  }))
  return <ClientSegments label="Что прислал тренер" items={items} />
}
