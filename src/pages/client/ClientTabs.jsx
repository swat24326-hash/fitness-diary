import { NavLink, useLocation } from 'react-router-dom'
import { ClipboardList, House, ListChecks, MessageCircle } from 'lucide-react'
import { clientShowsFromTrainerTab } from '../../lib/chat/clientAzChatCore.js'
import { inboxBadgeText, inboxButtonLabelRu } from '../../lib/client/clientInboxUiCore.js'
import { CLIENT_PLAN_ROUTES, clientPlanFresh, clientPlanTabTarget } from '../../lib/client/clientPlanUiCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'
import { useClientChatAttention } from './useClientChatAttention.js'

const PLAN_PATHS = Object.values(CLIENT_PLAN_ROUTES)

/** Число на «Сообщениях» — только диалоги (опросы и объявления — на колокольчике). */
export function clientAttention(data) {
  return Number(data?.chat_attention) || 0
}

function Tab({ to, end, active, icon: Icon, label, ariaLabel, badge = '', dot = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `coach-tabs__tab${(active ?? isActive) ? ' is-active' : ''}`}
      aria-label={ariaLabel ?? label}
    >
      <span className="coach-tabs__icon">
        <Icon size={22} aria-hidden />
        {badge ? (
          <span className="coach-tabs__badge" aria-hidden>
            {badge}
          </span>
        ) : null}
        {dot ? <span className="client-plan-tab__dot" aria-hidden /> : null}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

/**
 * Нижние вкладки /me — как у тренера. Число на «Сообщениях» само проверяется, пока экран открыт
 * (свежая проверка важнее старого ответа главной). До первой проверки — число экрана или кэш.
 * Точка «Новое» на «От тренера» — с кэша.
 */
export function ClientTabs({ attention, showFromTrainer: showFromTrainerProp }) {
  const { pathname } = useLocation()
  const live = useClientChatAttention()
  const cached = readClientMeCache()?.data
  const count = live ?? attention ?? clientAttention(cached)
  const showFromTrainer = showFromTrainerProp ?? clientShowsFromTrainerTab(cached?.client)
  const fresh = showFromTrainer && (clientPlanFresh(cached?.plans, 'homework') || clientPlanFresh(cached?.plans, 'nutrition'))
  return (
    <nav className="coach-tabs" aria-label="Разделы">
      <Tab to={CLIENT_HOME} end icon={House} label="Главная" />
      <Tab to="/me/trainings" icon={ListChecks} label="Тренировки" />
      {showFromTrainer ? (
        <Tab
          to={clientPlanTabTarget(cached?.plans)}
          active={PLAN_PATHS.includes(pathname)}
          icon={ClipboardList}
          label="От тренера"
          ariaLabel={`Задание и питание от тренера${fresh ? ', новое' : ''}`}
          dot={fresh}
        />
      ) : null}
      <Tab to="/me/inbox" icon={MessageCircle} label="Сообщения" ariaLabel={inboxButtonLabelRu(count)} badge={inboxBadgeText(count)} />
    </nav>
  )
}
