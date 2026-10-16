import { useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { HeaderChatSoundSwitch } from '../../components/header/HeaderChatSoundSwitch.jsx'
import { NotificationsSettingsFold } from '../../components/header/NotificationsSettingsFold.jsx'
import { LegalEntryLinks } from '../../components/legal/LegalEntryLinks.jsx'
import { ProfileMenuUser } from '../../components/profile/ProfileMenuUser.jsx'
import { SignOutWarnDialog } from '../../components/screenCache/SignOutWarnDialog.jsx'
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
 * уведомления, звуки, обновить), ниже «Выйти». Выход стирает кэш экранов на телефоне — сначала окно-предупреждение.
 */
export function CoachMorePage() {
  const { signOut } = useCoachApp()
  const me = useCoachLoad(fetchCoachMe, { cacheKey: ME_CACHE })
  const [warnOpen, setWarnOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirmSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
      setWarnOpen(false)
    }
  }

  return (
    <CoachShell title="Меню">
      <nav className="coach-menu" aria-label="Меню">
        <ProfileMenuUser
          name={me.data?.name || 'Тренер'}
          api={coachAvatarApi}
          cacheKey="coach"
          settings={
            <>
              <NotificationsSettingsFold>
                <CoachMenuPushSwitch />
                <HeaderChatSoundSwitch />
              </NotificationsSettingsFold>
              <button type="button" className="app-header__menu-item" onClick={() => window.location.reload()}>
                <RefreshCw size={18} aria-hidden />
                Обновить
              </button>
              <LegalEntryLinks className="legal-entry-links--in-profile" />
            </>
          }
        >
          Ежедневник правится и здесь, и на планшете. Тренировки и карточки клиентов — на планшете.
        </ProfileMenuUser>
        <button
          type="button"
          className="app-header__menu-item app-header__menu-item--danger"
          onClick={() => setWarnOpen(true)}
        >
          <LogOut size={18} aria-hidden />
          Выйти
        </button>
      </nav>
      <SignOutWarnDialog
        app="coach"
        open={warnOpen}
        busy={busy}
        onCancel={() => !busy && setWarnOpen(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </CoachShell>
  )
}
