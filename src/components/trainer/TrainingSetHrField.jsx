import { useRef } from 'react'
import { useHeartRateSessions } from '../../context/HeartRateSessionsContext'
import { HR_AFTER_DOUBLE_TAP_MS, applyHrAfterFillFromLive } from '../../lib/hr/hrAfterFromLiveSlot.js'

/**
 * Ячейка «Пульс» подхода: ручной ввод + двойной тап → текущий BPM с датчика клиента.
 * После подстановки снимаем фокус — иначе на планшете вместе с секундомером
 * открывается клавиатура и экран может «осыпаться» в пустой зелёный фон.
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   clientId?: string,
 *   title?: string,
 *   compact?: boolean,
 *   micro?: boolean,
 *   gridArea?: string,
 * }} props
 */
export function TrainingSetHrField({
  value,
  onChange,
  clientId = '',
  title,
  compact = false,
  micro = false,
  gridArea = '',
}) {
  const hr = useHeartRateSessions()
  const lastTapAtRef = useRef(0)

  const hint =
    title ||
    'Пульс после подхода (уд/мин). Двойной тап — текущий пульс с датчика'

  const tryFillFromLive = (inputEl) => {
    const slot = hr.slotForClient?.(clientId) ?? null
    applyHrAfterFillFromLive(slot, {
      onChange,
      blur: () => {
        if (inputEl && typeof inputEl.blur === 'function') inputEl.blur()
      },
    })
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const now = Date.now()
    if (now - lastTapAtRef.current <= HR_AFTER_DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0
      e.preventDefault()
      tryFillFromLive(e.currentTarget)
      return
    }
    lastTapAtRef.current = now
  }

  return (
    <div
      className={[
        'field',
        compact ? 'set-row-compact__field' : '',
        micro ? 'set-row-compact__field--hr-micro' : '',
        gridArea,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {compact ? <label className="sr-only">Пульс</label> : <label className="label">Пульс</label>}
      <input
        className="input"
        inputMode="numeric"
        placeholder={micro ? 'уд' : compact ? 'Пульс' : undefined}
        title={hint}
        aria-label={hint}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={onPointerDown}
      />
    </div>
  )
}
