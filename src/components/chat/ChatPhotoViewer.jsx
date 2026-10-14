import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { saveChatAttach } from '../../lib/chat/chatAttachCache.js'

/** Фото на весь экран: тап по фону или Esc — закрыть, «Сохранить» — скачать; на компьютере клик по фото — в натуральную величину. */
export function ChatPhotoViewer({ url, onClose }) {
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  /* Портал всплывает по дереву React к сообщению: без этого двойной клик тут поставил бы 👍, удержание открыло бы меню. */
  const stop = (e) => e.stopPropagation()
  return createPortal(
    <div
      className="chat-photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Фото"
      data-testid="chat-photo-viewer"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={stop}
      onDoubleClick={stop}
    >
      <div className="chat-photo-viewer__bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="chat-photo-viewer__btn" aria-label="Сохранить" title="Сохранить" onClick={() => saveChatAttach(url, 'Фото.jpg')}>
          <Download size={20} aria-hidden />
        </button>
        <button type="button" className="chat-photo-viewer__btn" aria-label="Закрыть" title="Закрыть" onClick={onClose}>
          <X size={22} aria-hidden />
        </button>
      </div>
      <div className={`chat-photo-viewer__stage${zoomed ? ' is-zoomed' : ''}`}>
        <img
          src={url}
          alt="Фото"
          onClick={(e) => {
            e.stopPropagation()
            setZoomed((z) => !z)
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
