import { CloseButton } from './CloseButton'

/**
 * @param {{ title: React.ReactNode, onClose?: () => void, titleId?: string, children?: React.ReactNode, closeDisabled?: boolean }} props
 */
export function ModalHeader({ title, onClose, titleId, children, closeDisabled = false }) {
  return (
    <div className="modal-header row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
      <h2
        id={titleId}
        className="section-title"
        style={{ fontSize: '1.1rem', margin: 0, flex: '1 1 auto', minWidth: 0 }}
      >
        {title}
      </h2>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
        {onClose ? <CloseButton onClick={onClose} disabled={closeDisabled} /> : null}
      </div>
    </div>
  )
}
