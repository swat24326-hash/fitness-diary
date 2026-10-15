import { AvatarPhoto } from '../profile/AvatarPhoto.jsx'
import { ProfileStatusMark } from '../profile/ProfileStatusMark.jsx'
import { ChatHeadMenu } from './ChatHeadMenu.jsx'
import '../../styles/chat-head-bar.css'

/**
 * Шапка диалога одной строкой, как в Telegram: «←» (только телефон), фото собеседника или значок, название и подпись под ним, справа «⋮».
 * В «⋮» — лупа (её ставит ChatThreadView в searchHostRef, пока лента открыта) и пункты menu (строки app-header__menu-item).
 * status — смайлик-статус после имени (ProfileStatusMark).
 * @param {{ back?: import('react').ReactNode, icon: import('react').ComponentType<{ size?: number }>, photo?: string | null, status?: string | null, title: string,
 *   subtitle?: string, menu?: import('react').ReactNode, searchHostRef?: (el: HTMLElement | null) => void, className?: string }} props
 */
export function ChatHeadBar({ back = null, icon: Icon, photo = null, status = null, title, subtitle = '', menu = null, searchHostRef, className = '' }) {
  return (
    <header className={`chat-head chat-bar${className ? ` ${className}` : ''}`}>
      {back}
      <span className="chat-bar__icon" aria-hidden>
        <AvatarPhoto src={photo} fallback={<Icon size={20} />} />
      </span>
      <div className="chat-bar__text">
        {status ? (
          <div className="profile-status-name">
            <h1 className="chat-bar__title" title={title}>
              {title}
            </h1>
            <ProfileStatusMark emoji={status} />
          </div>
        ) : (
          <h1 className="chat-bar__title" title={title}>
            {title}
          </h1>
        )}
        {subtitle ? (
          <small className="chat-bar__sub" title={subtitle}>
            {subtitle}
          </small>
        ) : null}
      </div>
      {searchHostRef || menu ? <ChatHeadMenu searchHostRef={searchHostRef}>{menu}</ChatHeadMenu> : null}
    </header>
  )
}
