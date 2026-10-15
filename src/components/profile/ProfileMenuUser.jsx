import { useState } from 'react'
import { useMyAvatar } from '../../hooks/useMyAvatar.js'
import { ProfileMenuRow } from './ProfileMenuRow.jsx'
import { ProfilePhotoSheet } from './ProfilePhotoSheet.jsx'

/**
 * Строка «кто вошёл» сверху меню + своё окно «Мой профиль» (телефон тренера, приложение клиента).
 * Планшет держит окно в шапке (HeaderProfileSheet) — его открывает и страница «Профиль».
 * children — подпись под именем; settings — пункты настроек внутри окна; attention — красная точка.
 * @param {{ name: string, api: import('../../lib/profile/avatarApi.js').AvatarApi, cacheKey: string, className?: string,
 *   children?: import('react').ReactNode, settings?: import('react').ReactNode, attention?: boolean }} props
 */
export function ProfileMenuUser({ name, api, cacheKey, className = '', children = null, settings = null, attention = false }) {
  const avatar = useMyAvatar(api, cacheKey)
  const [open, setOpen] = useState(false)
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
      <ProfilePhotoSheet open={open} onClose={() => setOpen(false)} name={name} avatar={avatar} settings={settings} />
    </>
  )
}
