import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

const MENU_GAP = 6
const VIEW_PAD = 8

/**
 * Kebab (⋮) для редких действий в строке клиента / абонемента.
 * Меню через portal + fixed — иначе overflow у `.table-wrap` / карточек
 * обрезает панель, и она «падает» под кнопки соседней строки.
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
  const [coords, setCoords] = useState(/** @type {{ top: number, left: number, minWidth: number } | null} */ (null))
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const menuRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const menuId = useId()
  const visibleItems = (items ?? []).filter(Boolean)

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return undefined
    }

    const place = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const tr = trigger.getBoundingClientRect()
      const mr = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const minWidth = Math.max(220, Math.ceil(tr.width))

      let top = tr.bottom + MENU_GAP
      if (top + mr.height > vh - VIEW_PAD) {
        top = Math.max(VIEW_PAD, tr.top - MENU_GAP - mr.height)
      }

      let left = tr.right - Math.max(mr.width, minWidth)
      left = Math.min(left, vw - VIEW_PAD - Math.max(mr.width, minWidth))
      left = Math.max(VIEW_PAD, left)

      setCoords({ top, left, minWidth })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, visibleItems.length])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      const t = /** @type {Node} */ (e.target)
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
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

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={menuId}
            ref={menuRef}
            className="client-row-more__menu client-row-more__menu--portal"
            role="menu"
            aria-label={ariaLabel}
            style={
              coords
                ? { top: coords.top, left: coords.left, minWidth: coords.minWidth }
                : { top: 0, left: 0, visibility: 'hidden' }
            }
          >
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
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`client-row-more${open ? ' client-row-more--open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
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
      {menu}
    </div>
  )
}
