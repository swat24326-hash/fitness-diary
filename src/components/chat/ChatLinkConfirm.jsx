import { ExternalLink, TriangleAlert } from 'lucide-react'
import { useEffect, useId } from 'react'

/**
 * «Открыть ссылку?» — ссылка собеседника на чужой сайт.
 * @param {{ link: { url: string, host: string, warnings: string[] } | null, onClose: () => void }} props
 */
export function ChatLinkConfirm({ link, onClose }) {
  const titleId = useId()
  useEffect(() => {
    if (!link) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [link, onClose])
  if (!link) return null

  const open = () => {
    window.open(link.url, '_blank', 'noopener,noreferrer')
    onClose()
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="modal-panel chat-link-confirm" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="section-title chat-link-confirm__title">
          Открыть ссылку?
        </h2>
        <p className="chat-link-confirm__host">{link.host}</p>
        <p className="chat-link-confirm__url muted">{link.url}</p>
        {link.warnings.length ? (
          <ul className="chat-link-confirm__warn">
            {link.warnings.map((w) => (
              <li key={w}>
                <TriangleAlert size={16} aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="muted chat-link-confirm__note">
          Ссылка ведёт на другой сайт. Не вводите там пароли, коды из SMS и данные карты.
        </p>
        <div className="row td-modal-actions chat-link-confirm__actions">
          <button type="button" className="btn btn-ghost btn-touch" onClick={onClose} autoFocus>
            Отмена
          </button>
          <button type="button" className="btn btn-touch" onClick={open}>
            <ExternalLink size={16} aria-hidden />
            Открыть
          </button>
        </div>
      </div>
    </div>
  )
}
