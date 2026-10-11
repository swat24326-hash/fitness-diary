import { LogOut, RefreshCw, User } from 'lucide-react'
import { HeaderChatSoundSwitch } from '../../components/header/HeaderChatSoundSwitch.jsx'
import { HeaderSettingsMenu } from '../../components/header/HeaderSettingsMenu.jsx'
import { fetchCoachMe } from '../../lib/coach/coachApiClient.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachMenuPushSwitch } from './CoachMenuPushSwitch.jsx'
import { CoachShell } from './CoachShell.jsx'
import { useCoachLoad } from './useCoachLoad.js'

/**
 * «Меню» (три полоски в шапке) — как бургер планшета: «Настройки» (имя, уведомления, звуки, обновить) и «Выйти».
 * Данных клуба на телефоне нет — ни перезагрузка, ни выход ничего не теряют.
 */
export function CoachMorePage() {
  const { signOut } = useCoachApp()
  const me = useCoachLoad(fetchCoachMe)

  return (
    <CoachShell title="Меню">
      <nav className="coach-menu" aria-label="Меню">
        <HeaderSettingsMenu defaultOpen>
          <div className="app-header__menu-user">
            <User size={16} aria-hidden className="app-header__menu-user-icon" />
            <div className="app-header__menu-user-text">
              <span className="app-header__menu-user-name">{me.data?.name || 'Тренер'}</span>
              <br />
              Ежедневник правится и здесь, и на планшете. Тренировки и карточки клиентов — на планшете.
            </div>
          </div>
          <CoachMenuPushSwitch />
          <HeaderChatSoundSwitch />
          <button type="button" className="app-header__menu-item" onClick={() => window.location.reload()}>
            <RefreshCw size={18} aria-hidden />
            Обновить
          </button>
        </HeaderSettingsMenu>
        <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={() => void signOut()}>
          <LogOut size={18} aria-hidden />
          Выйти
        </button>
      </nav>
    </CoachShell>
  )
}
