import { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'

/**
 * Плитка сводки: крупная цифра + подпись на виду; «?» — подробная подсказка.
 * @param {{
 *   icon: import('react').ReactNode,
 *   count: number,
 *   label: string,
 *   helpText: string,
 *   active?: boolean,
 *   hot?: boolean,
 *   warn?: boolean,
 *   pending?: boolean,
 *   onSelect: () => void,
 * }} props
 */
export function AdminClientsFilterTile({
  icon,
  count,
  label,
  helpText,
  active = false,
  hot = false,
  warn = false,
  pending = false,
  onSelect,
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  const rootRef = useRef(null)
  const helpId = useId()
  const displayCount = pending ? '…' : count
  const digits = String(displayCount ?? 0).length

  useEffect(() => {
    if (!helpOpen) return undefined
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setHelpOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [helpOpen])

  const tileClass = [
    'admin-clients-filter-tile',
    active ? 'admin-clients-filter-tile--active' : '',
    hot ? 'admin-clients-filter-tile--hot' : '',
    warn ? 'admin-clients-filter-tile--warn' : '',
    digits >= 3 ? 'admin-clients-filter-tile--wide-num' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li ref={rootRef} className="admin-clients-filter-tile-wrap">
      <div className={tileClass}>
        <button
          type="button"
          className={`admin-clients-filter-tile__help${helpOpen ? ' admin-clients-filter-tile__help--on' : ''}`}
          aria-label={`Подробнее: ${label}`}
          aria-expanded={helpOpen}
          aria-controls={helpId}
          title="Подробнее"
          onClick={() => setHelpOpen((v) => !v)}
        >
          <CircleHelp size={15} aria-hidden />
        </button>

        <button
          type="button"
          className="admin-clients-filter-tile__main"
          onClick={onSelect}
          aria-pressed={active}
          aria-label={`${label}: ${displayCount}`}
        >
          <span className="admin-clients-filter-tile__icon" aria-hidden>
            {icon}
          </span>
          <span className="admin-clients-filter-tile__count">{displayCount}</span>
          <span className="admin-clients-filter-tile__label">{label}</span>
        </button>

        {helpOpen ? (
          <p id={helpId} className="admin-clients-filter-tile__pop" role="note">
            {helpText}
          </p>
        ) : null}
      </div>
    </li>
  )
}
