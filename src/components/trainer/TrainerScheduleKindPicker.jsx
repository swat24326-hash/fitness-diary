import { useCallback, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SCHEDULE_KINDS } from '../../lib/trainer/trainerScheduleKindCore.js'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.js'

/**
 * Категория записи: компактная кнопка + меню (по умолчанию) или ряд плашек.
 * @param {{
 *   value: string,
 *   onChange: (kind: string) => void,
 *   compact?: boolean,
 *   onOpenChange?: (open: boolean) => void,
 *   menuOpen?: boolean,
 * }} props
 */
export function TrainerScheduleKindPicker({ value, onChange, compact = true, onOpenChange, menuOpen }) {
  const [innerOpen, setInnerOpen] = useState(false)
  const controlled = typeof menuOpen === 'boolean'
  const open = controlled ? menuOpen : innerOpen
  const setOpen = useCallback(
    (v) => {
      if (!controlled) setInnerOpen(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const close = useCallback(() => setOpen(false), [setOpen])
  usePopoverDismiss(open, close, rootRef)
  const current = SCHEDULE_KINDS.find((k) => k.id === value) ?? SCHEDULE_KINDS[0]

  if (!compact) {
    return (
      <div className="trainer-schedule-kinds" role="radiogroup" aria-label="Категория записи">
        {SCHEDULE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={value === k.id}
            className={`trainer-schedule-kinds__chip trainer-schedule-kind--${k.id}${value === k.id ? ' trainer-schedule-kinds__chip--on' : ''}`}
            onClick={() => onChange(k.id)}
          >
            <span className="trainer-schedule-kinds__dot" aria-hidden />
            {k.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="trainer-schedule-kinds-compact" ref={rootRef}>
      <button
        type="button"
        className={`trainer-schedule-kinds-compact__btn trainer-schedule-kind--${current.id}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Категория: ${current.label}`}
        data-testid="schedule-kind-trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="trainer-schedule-kinds__dot" aria-hidden />
        <span className="trainer-schedule-kinds-compact__label">{current.label}</span>
        <ChevronDown size={16} aria-hidden className="trainer-schedule-kinds-compact__chevron" />
      </button>
      {open ? (
        <ul className="trainer-schedule-kinds-compact__menu" role="listbox" aria-label="Категория записи">
          {SCHEDULE_KINDS.map((k) => (
            <li key={k.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === k.id}
                className={`trainer-schedule-kinds-compact__option trainer-schedule-kind--${k.id}${value === k.id ? ' trainer-schedule-kinds-compact__option--on' : ''}`}
                onClick={() => {
                  onChange(k.id)
                  setOpen(false)
                }}
              >
                <span className="trainer-schedule-kinds__dot" aria-hidden />
                {k.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Легенда под сеткой: что значит цвет. */
export function TrainerScheduleKindLegend() {
  return (
    <ul className="trainer-schedule-legend" aria-label="Цвета категорий">
      {SCHEDULE_KINDS.map((k) => (
        <li key={k.id} className={`trainer-schedule-legend__item trainer-schedule-kind--${k.id}`}>
          <span className="trainer-schedule-kinds__dot" aria-hidden />
          {k.label}
        </li>
      ))}
    </ul>
  )
}
