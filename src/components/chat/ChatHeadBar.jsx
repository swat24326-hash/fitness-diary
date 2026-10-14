import '../../styles/chat-head-bar.css'

/**
 * Шапка диалога одной строкой, как в Telegram: «←» (только телефон), значок, название и подпись под ним, справа кнопки.
 * searchHostRef — место для лупы: её ставит туда ChatThreadView (searchHost), пока лента открыта.
 * @param {{ back?: import('react').ReactNode, icon: import('react').ComponentType<{ size?: number }>, title: string,
 *   subtitle?: string, actions?: import('react').ReactNode, searchHostRef?: (el: HTMLElement | null) => void, className?: string }} props
 */
export function ChatHeadBar({ back = null, icon: Icon, title, subtitle = '', actions = null, searchHostRef, className = '' }) {
  return (
    <header className={`chat-head chat-bar${className ? ` ${className}` : ''}`}>
      {back}
      <span className="chat-bar__icon" aria-hidden>
        <Icon size={20} />
      </span>
      <div className="chat-bar__text">
        <h1 className="chat-bar__title" title={title}>
          {title}
        </h1>
        {subtitle ? (
          <small className="chat-bar__sub" title={subtitle}>
            {subtitle}
          </small>
        ) : null}
      </div>
      <div className="chat-bar__actions">
        {searchHostRef ? <span ref={searchHostRef} className="chat-bar__slot" /> : null}
        {actions}
      </div>
    </header>
  )
}
