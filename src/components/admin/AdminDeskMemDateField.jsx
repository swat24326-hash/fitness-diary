import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { formatDateRu, openNativeDatePicker, parseFlexibleDateToIso } from '../../lib/dateRu.js'

/**
 * Дата desk: ввод дд.мм.гггг + кнопка календаря (нативный type=date на тёмной теме часто «не кликается»).
 * @param {{
 *   value?: string,
 *   onChange?: (iso: string) => void,
 *   'aria-label'?: string,
 *   allowEmpty?: boolean,
 * }} props
 */
export function AdminDeskMemDateField({
  value = '',
  onChange,
  'aria-label': ariaLabel = 'Дата',
  allowEmpty = false,
}) {
  const iso = parseFlexibleDateToIso(value) || ''
  const [text, setText] = useState(() => (iso ? formatDateRu(iso) : ''))
  const nativeRef = useRef(null)

  useEffect(() => {
    const next = parseFlexibleDateToIso(value) || ''
    setText(next ? formatDateRu(next) : '')
  }, [value])

  const commitText = (raw) => {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) {
      setText('')
      if (allowEmpty && iso) onChange?.('')
      else if (!allowEmpty && iso) setText(formatDateRu(iso))
      return
    }
    const parsed = parseFlexibleDateToIso(trimmed)
    if (parsed) {
      setText(formatDateRu(parsed))
      if (parsed !== iso) onChange?.(parsed)
      return
    }
    setText(iso ? formatDateRu(iso) : '')
  }

  return (
    <div className="admin-desk-mem-date">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="дд.мм.гггг"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitText(e.currentTarget.value)
          }
        }}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="admin-desk-mem-date__cal"
        title="Календарь"
        aria-label={`${ariaLabel}: открыть календарь`}
        onClick={() => openNativeDatePicker(nativeRef.current)}
      >
        <Calendar size={16} aria-hidden />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="admin-desk-mem-date__native"
        value={iso}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const v = String(e.target.value || '').slice(0, 10)
          if (!v) {
            if (allowEmpty) {
              setText('')
              onChange?.('')
            }
            return
          }
          setText(formatDateRu(v))
          onChange?.(v)
        }}
      />
    </div>
  )
}
