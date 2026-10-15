import { useState } from 'react'
import { Camera } from 'lucide-react'
import { useMyAvatar } from '../../hooks/useMyAvatar.js'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { AvatarPhoto } from './AvatarPhoto.jsx'
import { ProfilePhotoSheet } from './ProfilePhotoSheet.jsx'

/**
 * Строка «кто вошёл» в меню (планшет, телефон тренера, приложение клиента): своё фото и имя, нажатие — «Мой профиль».
 * children — подпись под именем (офлайн, подсказка).
 * @param {{ name: string, api: import('../../lib/profile/avatarApi.js').AvatarApi, cacheKey: string, className?: string, children?: import('react').ReactNode }} props
 */
export function ProfileMenuUser({ name, api, cacheKey, className = '', children = null }) {
  const avatar = useMyAvatar(api, cacheKey)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`profile-menu-user${className ? ` ${className}` : ''}`}
        onClick={() => setOpen(true)}
        title="Мой профиль — фото"
        data-testid="profile-menu-user"
      >
        <span className="profile-menu-user__avatar" aria-hidden>
          <AvatarPhoto src={avatar.photo} fallback={chatInitials(name) || <Camera size={16} />} />
        </span>
        <span className="profile-menu-user__text">
          <span className="profile-menu-user__name">{name || '—'}</span>
          {children}
        </span>
      </button>
      <ProfilePhotoSheet open={open} onClose={() => setOpen(false)} name={name} avatar={avatar} />
    </>
  )
}
