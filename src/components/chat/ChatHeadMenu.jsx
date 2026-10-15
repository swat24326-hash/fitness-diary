import { useCallback, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.js'

/**
 * «⋮» справа в шапке диалога, как в Telegram: поиск, «Без звука», пункты экрана.
 * Меню всегда в разметке (скрыто, пока закрыто): в searchHostRef лупу ставит ChatThreadView, пока лента открыта.
 * Любая кнопка или ссылка в меню его закрывает.
 * @param {{ searchHostRef?: (el: HTMLElement | null) => void, children?: import('react').ReactNode }} props
 */
export function ChatHeadMenu({ searchHostRef, children = null }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  usePopoverDismiss(open, close, rootRef)
  return (
    <span className="chat-bar__menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Ещё"
        title="Ещё"
      >
        <EllipsisVertical size={20} aria-hidden />
      </button>
      <div
        className="app-header__dropdown chat-bar__dropdown"
        role="region"
        aria-label="Действия с диалогом"
        hidden={!open}
        onClick={(e) => {
          if (e.target instanceof Element && e.target.closest('button, a')) close()
        }}
      >
        {searchHostRef ? <span ref={searchHostRef} className="chat-bar__slot" /> : null}
        {children}
      </div>
    </span>
  )
}
