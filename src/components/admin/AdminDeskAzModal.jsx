import { createPortal } from 'react-dom'

/**
 * Окно АЗ поверх списка: portal на body.
 * Иначе fixed внутри `.list-item:hover { transform }` оказывается под соседними строками.
 *
 * @param {{
 *   open: boolean,
 *   label: string,
 *   onBackdrop?: () => void,
 *   wide?: boolean,
 *   children: import('react').ReactNode,
 * }} props
 */
export function AdminDeskAzModal({ open, label, onBackdrop, wide = false, children }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="admin-desk-az-modal" role="dialog" aria-modal="true" aria-label={label}>
      <div className="admin-desk-az-modal__backdrop" onClick={onBackdrop} />
      <div className={`admin-desk-az-modal__card${wide ? ' admin-desk-az-modal__card--wide' : ''}`}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
