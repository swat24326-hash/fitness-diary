import { useCallback, useRef, useState } from 'react'
import { CalendarCheck, Check, MoreVertical } from 'lucide-react'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.js'
import { SCHEDULE_VIEW_OPTIONS } from './TrainerScheduleViewSwitcher.jsx'

/**
 * Режим календаря одной кнопкой «⋮» справа в шапке (телефон); сверху — «Сегодня».
 * @param {{ view: string, onChange: (view: string) => void, views?: string[], onToday?: () => void }} props
 */
export function TrainerScheduleViewMenu({ view, onChange, views, onToday }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const options = views
    ? SCHEDULE_VIEW_OPTIONS.filter((opt) => views.includes(opt.id))
    : SCHEDULE_VIEW_OPTIONS
  const current = options.find((opt) => opt.id === view)

  const close = useCallback(() => setOpen(false), [])
  usePopoverDismiss(open, close, rootRef)

  return (
    <div className="trainer-schedule-view-menu" ref={rootRef}>
      <button
        type="button"
        className="trainer-schedule-view-menu__toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Режим календаря: ${current?.label ?? ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={20} aria-hidden />
      </button>
      {open ? (
        <div className="trainer-schedule-view-menu__list" role="menu" aria-label="Режим календаря">
          {onToday ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="trainer-schedule-view-menu__item"
                onClick={() => {
                  setOpen(false)
                  onToday()
                }}
              >
                <span>Сегодня</span>
                <CalendarCheck size={18} aria-hidden />
              </button>
              <div className="trainer-schedule-view-menu__divider" role="separator" />
            </>
          ) : null}
          {options.map((opt) => {
            const active = opt.id === view
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={[
                  'trainer-schedule-view-menu__item',
                  active ? 'trainer-schedule-view-menu__item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setOpen(false)
                  if (!active) onChange(opt.id)
                }}
              >
                <span>{opt.label}</span>
                {active ? <Check size={18} aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
