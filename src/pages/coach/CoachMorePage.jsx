import { LogOut, RefreshCw } from 'lucide-react'
import { HeaderChatSoundSwitch } from '../../components/header/HeaderChatSoundSwitch.jsx'
import { ProfileMenuUser } from '../../components/profile/ProfileMenuUser.jsx'
import { fetchCoachMe } from '../../lib/coach/coachApiClient.js'
import { coachRequest } from '../../lib/coach/coachSession.js'
import { avatarApiOver } from '../../lib/profile/avatarApi.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachMenuPushSwitch } from './CoachMenuPushSwitch.jsx'
import { CoachShell } from './CoachShell.jsx'
import { useCoachLoad } from './useCoachLoad.js'

const coachAvatarApi = avatarApiOver((body) => coachRequest({}, body))
const ME_CACHE = screenCacheKey('coach', 'me')

/**
 * «Меню» (три полоски в шапке) — как бургер планшета: сверху своё фото и имя — «Мой профиль» (фото и настройки:
 * уведомления, звуки, обновить), ниже «Выйти». На телефоне только кэш экранов (стирается при выходе) —
 * ни перезагрузка, ни выход ничего не теряют.
 */
export function CoachMorePage() {
  const { signOut } = useCoachApp()
  const me = useCoachLoad(fetchCoachMe, { cacheKey: ME_CACHE })

  return (
    <CoachShell title="Меню">
      <nav className="coach-menu" aria-label="Меню">
        <ProfileMenuUser
          name={me.data?.name || 'Тренер'}
          api={coachAvatarApi}
          cacheKey="coach"
          settings={
            <>
              <CoachMenuPushSwitch />
              <HeaderChatSoundSwitch />
              <button type="button" className="app-header__menu-item" onClick={() => window.location.reload()}>
                <RefreshCw size={18} aria-hidden />
                Обновить
              </button>
            </>
          }
        >
          Ежедневник правится и здесь, и на планшете. Тренировки и карточки клиентов — на планшете.
        </ProfileMenuUser>
        <button type="button" className="app-header__menu-item app-header__menu-item--danger" onClick={() => void signOut()}>
          <LogOut size={18} aria-hidden />
          Выйти
        </button>
      </nav>
    </CoachShell>
  )
}
