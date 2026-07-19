import { useEffect, useId, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

/**
 * Kebab (⋮) для редких действий в строке клиента.
 * @param {{
 *   disabled?: boolean,
 *   ariaLabel: string,
 *   items: Array<{
 *     id: string,
 *     label: string,
 *     icon?: import('react').ComponentType<{ size?: number, 'aria-hidden'?: boolean }>,
 *     danger?: boolean,
 *     disabled?: boolean,
 *     onSelect: () => void,
 *   }>,
 * }} props
 */
export function ClientRowMoreMenu({ disabled = false, ariaLabel, items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const menuId = useId()
  const visibleItems = (items ?? []).filter(Boolean)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      if (!rootRef.current?.contains(/** @type {Node} */ (e.target))) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (visibleItems.length === 0) return null

  return (
    <div className={`client-row-more${open ? ' client-row-more--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch client-row-more__trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={20} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className="client-row-more__menu" role="menu" aria-label={ariaLabel}>
          {visibleItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`client-row-more__item${item.danger ? ' client-row-more__item--danger' : ''}`}
                disabled={disabled || item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect?.()
                }}
              >
                {Icon ? <Icon size={18} aria-hidden /> : null}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
