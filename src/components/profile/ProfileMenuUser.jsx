import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMyAvatar } from '../../hooks/useMyAvatar.js'
import { consumeReopenMyProfileState, MY_PROFILE_OPEN_EVENT } from '../../lib/profile/myProfileEvents.js'
import { ProfileMenuRow } from './ProfileMenuRow.jsx'
import { ProfilePhotoSheet } from './ProfilePhotoSheet.jsx'

/**
 * Строка «кто вошёл» сверху меню + своё окно «Мой профиль» (телефон тренера, приложение клиента).
 * Планшет держит окно в шапке (HeaderProfileSheet) — его открывает и страница «Профиль».
 * children — подпись под именем; settings — пункты настроек внутри окна; attention — красная точка.
 * layout — размер окна: phone (телефон тренера / клиент), tablet, desk.
 * @param {{ name: string, api: import('../../lib/profile/avatarApi.js').AvatarApi, cacheKey: string, className?: string,
 *   children?: import('react').ReactNode, settings?: import('react').ReactNode, attention?: boolean,
 *   layout?: 'phone' | 'tablet' | 'desk' }} props
 */
export function ProfileMenuUser({ name, api, cacheKey, className = '', children = null, settings = null, attention = false, layout = 'phone' }) {
  const avatar = useMyAvatar(api, cacheKey)
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(MY_PROFILE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(MY_PROFILE_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    consumeReopenMyProfileState(location, navigate)
  }, [location, navigate])

  return (
    <>
      <ProfileMenuRow
        name={name}
        avatar={avatar}
        onClick={() => setOpen(true)}
        hint={settings ? 'Мой профиль и настройки' : 'Мой профиль'}
        attention={attention}
        className={className}
      >
        {children}
      </ProfileMenuRow>
      <ProfilePhotoSheet open={open} onClose={() => setOpen(false)} name={name} avatar={avatar} settings={settings} layout={layout} />
    </>
  )
}
