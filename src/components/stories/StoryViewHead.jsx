import { chatInitials } from '../../lib/chat/chatUiCore.js'
import { storyPostedShortRu } from '../../lib/stories/storyClubCore.js'
import { AvatarPhoto } from '../profile/AvatarPhoto.jsx'

/** Шапка просмотра как в Telegram: аватар, имя, время выкладки. */
export function StoryViewHead({ name, photo, createdAt }) {
  const title = String(name ?? '').trim() || 'Сотрудник'
  const when = storyPostedShortRu(createdAt)
  const initials = chatInitials(title) || '?'
  return (
    <div className="stories-view__head">
      <span className="stories-view__head-face">
        <AvatarPhoto src={photo} fallback={<span className="stories-view__head-initials">{initials}</span>} />
      </span>
      <span className="stories-view__head-meta">
        <strong>{title}</strong>
        {when ? <small>{when}</small> : null}
      </span>
    </div>
  )
}
