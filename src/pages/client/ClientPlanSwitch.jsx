import { useLocation } from 'react-router-dom'
import { Dumbbell, Salad } from 'lucide-react'
import { CLIENT_PLAN_ROUTES, CLIENT_PLAN_TITLES, clientPlanFresh } from '../../lib/client/clientPlanUiCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientSegments } from './ClientSegments.jsx'

const ICONS = { homework: Dumbbell, nutrition: Salad }

/** Переключатель внутри вкладки «От тренера»: задание ↔ питание, у непрочитанного — точка. */
export function ClientPlanSwitch() {
  const { pathname } = useLocation()
  const plans = readClientMeCache()?.data?.plans
  const items = Object.keys(CLIENT_PLAN_ROUTES).map((kind) => ({
    key: kind,
    to: CLIENT_PLAN_ROUTES[kind],
    label: CLIENT_PLAN_TITLES[kind],
    icon: ICONS[kind],
    active: pathname === CLIENT_PLAN_ROUTES[kind],
    dot: clientPlanFresh(plans, kind),
  }))
  return <ClientSegments label="Что прислал тренер" items={items} />
}
