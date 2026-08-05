import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import {
  birthDateYearBounds,
  formatDateRu,
  maskRuDateDigitsInput,
  openNativeDatePicker,
  parseFlexibleDateToIso,
} from '../../lib/dateRu.js'

/**
 * Дата desk: ввод дд.мм.гггг (маска из цифр) + кнопка календаря.
 * @param {{
 *   value?: string,
 *   onChange?: (iso: string) => void,
 *   'aria-label'?: string,
 *   allowEmpty?: boolean,
 *   birthDate?: boolean,
 * }} props
 */
export function AdminDeskMemDateField({
  value = '',
  onChange,
  'aria-label': ariaLabel = 'Дата',
  allowEmpty = false,
  birthDate = false,
}) {
  const yearOpts = useMemo(() => (birthDate ? birthDateYearBounds() : { minYear: 1990, maxYear: 2100 }), [birthDate])
  const iso = parseFlexibleDateToIso(value, yearOpts) || ''
  const [text, setText] = useState(() => (iso ? formatDateRu(iso) : ''))
  const nativeRef = useRef(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    // Пока печатают — не затирать маску извне (иначе после 8-й цифры года поле «сбрасывается»).
    if (focusedRef.current) return
    const next = parseFlexibleDateToIso(value, yearOpts) || ''
    const formatted = next ? formatDateRu(next) : ''
    setText((prev) => (prev === formatted ? prev : formatted))
  }, [value, yearOpts])

  const commitText = (raw) => {
    const masked = maskRuDateDigitsInput(raw)
    const trimmed = String(masked ?? '').trim()
    if (!trimmed) {
      setText('')
      if (allowEmpty && iso) onChange?.('')
      else if (!allowEmpty && iso) setText(formatDateRu(iso))
      return
    }
    const parsed = parseFlexibleDateToIso(trimmed, yearOpts)
    if (parsed) {
      setText(formatDateRu(parsed))
      if (parsed !== iso) onChange?.(parsed)
      return
    }
    // Невалидный хвост: вернуть последнюю принятую дату, не в пустоту во время правки.
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
        onFocus={() => {
          focusedRef.current = true
        }}
        onChange={(e) => {
          const masked = maskRuDateDigitsInput(e.target.value)
          setText(masked)
          const parsed = parseFlexibleDateToIso(masked, yearOpts)
          if (parsed) {
            if (parsed !== iso) onChange?.(parsed)
            return
          }
          if (allowEmpty && !masked.replace(/\D/g, '').length && iso) {
            onChange?.('')
          }
        }}
        onBlur={(e) => {
          focusedRef.current = false
          commitText(e.target.value)
        }}
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
        min={birthDate ? `${yearOpts.minYear}-01-01` : undefined}
        max={birthDate ? `${yearOpts.maxYear}-12-31` : undefined}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const v = String(e.target.value || '').slice(0, 10)
          // Пустой type=date часто стреляет сам при программной подстановке ISO — не затираем текст.
          if (!v) return
          const parsed = parseFlexibleDateToIso(v, yearOpts)
          if (!parsed) return
          setText(formatDateRu(parsed))
          onChange?.(parsed)
        }}
      />
    </div>
  )
}
