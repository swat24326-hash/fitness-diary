import { Camera } from 'lucide-react'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { AvatarPhoto } from './AvatarPhoto.jsx'
import { ProfileStatusMark } from './ProfileStatusMark.jsx'

/**
 * Строка «кто вошёл» сверху меню: своё фото, имя со статусом, подпись. Нажатие — открыть «Мой профиль» (onClick).
 * @param {{ name: string, avatar: ReturnType<typeof import('../../hooks/useMyAvatar.js').useMyAvatar>, onClick: () => void,
 *   hint: string, attention?: boolean, className?: string, children?: import('react').ReactNode }} props
 */
export function ProfileMenuRow({ name, avatar, onClick, hint, attention = false, className = '', children = null }) {
  return (
    <button
      type="button"
      className={`profile-menu-user${className ? ` ${className}` : ''}`}
      onClick={onClick}
      title="Мой профиль — фото и настройки"
      data-testid="profile-menu-user"
    >
      <span className="profile-menu-user__avatar" aria-hidden>
        <AvatarPhoto src={avatar.photo} fallback={chatInitials(name) || <Camera size={16} />} />
        {attention ? <span className="profile-menu-user__dot" /> : null}
      </span>
      <span className="profile-menu-user__text">
        <span className="profile-menu-user__name">
          {name || '—'} <ProfileStatusMark emoji={avatar.status?.emoji} />
        </span>
        <span className="profile-menu-user__hint">{hint}</span>
        {children}
      </span>
      {attention ? <span className="sr-only">Требует внимания</span> : null}
    </button>
  )
}
