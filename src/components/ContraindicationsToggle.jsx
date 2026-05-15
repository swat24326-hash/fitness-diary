import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

/**
 * @param {'inline' | 'modal'} [mode='inline'] — `modal`: окно поверх интерфейса (как «Тренировки абонемента»)
 */
export function ContraindicationsToggle({ text, size = 'md', title = 'Противопоказания', mode = 'inline' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const t = String(text ?? '').trim()
  const isModal = mode === 'modal'

  useEffect(() => {
    if (!t || !open || !isModal) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isModal, t])

  if (!t) return null

  const modal = isModal && open && (
    <div
      className="modal-overlay contra-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onClick={() => setOpen(false)}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3 id={id} style={{ margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="btn btn-ghost btn-icon-square" aria-label="Закрыть" title="Закрыть" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <p className="contra-modal-text">{t}</p>
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 12 }}>
          Данные из медкарты клиента. Изменить можно в карточке клиента → здоровье.
        </p>
      </div>
    </div>
  )

  return (
    <>
      <div className={`contra ${size === 'sm' ? 'contra--sm' : ''}`}>
        <button
          type="button"
          className="contra__btn"
          aria-label={isModal ? `${title}: открыть` : open ? `${title}: скрыть` : `${title}: показать`}
          title={title}
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={isModal ? undefined : id}
          onClick={() => (isModal ? setOpen(true) : setOpen((v) => !v))}
        >
          <AlertTriangle size={size === 'sm' ? 16 : 18} aria-hidden />
        </button>
        {!isModal ? (
          <div id={id} className={`contra__panel${open ? ' is-open' : ''}`} role="region" aria-label={title}>
            <div className="contra__text">{t}</div>
          </div>
        ) : null}
      </div>
      {modal ? createPortal(modal, document.body) : null}
    </>
  )
}
