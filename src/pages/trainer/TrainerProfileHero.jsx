import { Camera, Settings } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useMyAvatar } from '../../hooks/useMyAvatar.js'
import { staffAvatarApi } from '../../lib/profile/staffAvatarApi.js'
import { openMyProfile } from '../../lib/profile/myProfileEvents.js'
import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { AvatarPhoto } from '../../components/profile/AvatarPhoto.jsx'
import { ProfileStatusMark } from '../../components/profile/ProfileStatusMark.jsx'

/** Шапка страницы «Профиль»: своё фото и вход в то же окно «Мой профиль», что в бургере. */
export function TrainerProfileHero() {
  const { user } = useAuth()
  const name = user?.name ?? user?.email ?? 'Тренер'
  const avatar = useMyAvatar(staffAvatarApi, `u:${user?.id ?? ''}`)

  return (
    <section className="card trainer-profile-hero">
      <button
        type="button"
        className="trainer-profile-hero__photo"
        onClick={openMyProfile}
        title="Сменить фото"
        aria-label="Сменить фото профиля"
      >
        <span className="trainer-profile-hero__circle">
          <AvatarPhoto src={avatar.photo} fallback={chatInitials(name) || <Camera size={22} />} />
        </span>
        <span className="trainer-profile-hero__badge" aria-hidden>
          <Camera size={12} />
        </span>
      </button>
      <div className="trainer-profile-hero__text">
        <h1 className="section-title trainer-profile-hero__title">Профиль</h1>
        <p className="section-sub trainer-profile-hero__name">
          {name} <ProfileStatusMark emoji={avatar.status?.emoji} />
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square trainer-profile-hero__settings"
        onClick={openMyProfile}
        title="Фото и настройки"
        aria-label="Фото и настройки"
        data-testid="trainer-profile-settings"
      >
        <Settings aria-hidden />
      </button>
    </section>
  )
}
