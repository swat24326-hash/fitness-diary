import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, ChevronRight } from 'lucide-react'
import { ProfilePhotoSheet } from '../profile/ProfilePhotoSheet.jsx'
import { MY_PROFILE_OPEN_EVENT } from '../../lib/profile/myProfileEvents.js'

/**
 * «Мой профиль» сотрудника на планшете / в админке. Живёт в шапке, а не в бургере:
 * его открывает и строка меню, и кнопка «Фото и настройки» на странице «Профиль» тренера (openMyProfile).
 * layout: tablet — тренер на планшете; desk — менеджер / управляющий / админ на мониторе.
 * @param {{ open: boolean, onOpen: () => void, onClose: () => void, name: string,
 *   avatar: ReturnType<typeof import('../../hooks/useMyAvatar.js').useMyAvatar>, isTrainer: boolean,
 *   settings: import('react').ReactNode, layout?: 'tablet' | 'desk' }} props
 */
export function HeaderProfileSheet({ open, onOpen, onClose, name, avatar, isTrainer, settings, layout = 'desk' }) {
  useEffect(() => {
    window.addEventListener(MY_PROFILE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(MY_PROFILE_OPEN_EVENT, onOpen)
  }, [onOpen])

  const { ready, retry } = avatar
  useEffect(() => {
    if (open && !ready) retry()
  }, [open, ready, retry])

  const onStatsPage = useLocation().pathname === '/trainer/profile'
  const links = isTrainer && !onStatsPage ? (
    <Link to="/trainer/profile" className="app-header__menu-item" onClick={onClose} data-testid="profile-stats-link">
      <BarChart3 size={18} aria-hidden />
      Статистика и зарплата
      <ChevronRight size={18} className="profile-photo__link-arrow" aria-hidden />
    </Link>
  ) : null

  return (
    <ProfilePhotoSheet
      open={open}
      onClose={onClose}
      name={name}
      avatar={avatar}
      settings={settings}
      links={links}
      layout={isTrainer ? 'tablet' : layout}
    />
  )
}
