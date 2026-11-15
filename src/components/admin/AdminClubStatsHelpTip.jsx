import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

/**
 * «!» с выпадающим пояснением — квадратное окно нормальной ширины.
 * @param {{
 *   lines: string[],
 *   label?: string,
 *   className?: string,
 * }} props
 */
export function AdminClubStatsHelpTip({ lines, label = 'Что это значит', className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const popoverId = useId()
  const items = Array.isArray(lines) ? lines.filter(Boolean) : []

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) return null

  return (
    <div
      ref={rootRef}
      className={['admin-club-stats-help-tip', className].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="btn btn-ghost btn-icon-square admin-club-stats-help-tip__btn"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <AlertCircle size={18} aria-hidden />
      </button>
      {open ? (
        <div
          id={popoverId}
          className="admin-club-stats-help-tip__popover"
          role="region"
          aria-label={label}
        >
          <ul className="admin-club-stats-help-tip__list">
            {items.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
