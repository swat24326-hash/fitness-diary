import { useRef } from 'react'
import { useHeartRateSessions } from '../../context/HeartRateSessionsContext'
import { HR_AFTER_DOUBLE_TAP_MS, hrAfterFromLiveSlot } from '../../lib/hr/hrAfterFromLiveSlot.js'

/**
 * Ячейка «Пульс» подхода: ручной ввод + двойной тап → текущий BPM с датчика клиента.
 * Визуал как у обычного input — без тостов и вспышек (при нет сигнала просто не подставляем).
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   clientId?: string,
 *   title?: string,
 *   compact?: boolean,
 * }} props
 */
export function TrainingSetHrField({ value, onChange, clientId = '', title, compact = false }) {
  const hr = useHeartRateSessions()
  const lastTapAtRef = useRef(0)

  const hint =
    title ||
    'Пульс после подхода (уд/мин). Двойной тап — текущий пульс с датчика'

  const tryFillFromLive = () => {
    const slot = hr.slotForClient?.(clientId) ?? null
    const result = hrAfterFromLiveSlot(slot)
    if (result.ok) onChange(result.value)
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const now = Date.now()
    if (now - lastTapAtRef.current <= HR_AFTER_DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0
      e.preventDefault()
      tryFillFromLive()
      return
    }
    lastTapAtRef.current = now
  }

  return (
    <div className={`field${compact ? ' set-row-compact__field' : ''}`}>
      {compact ? <label className="sr-only">Пульс</label> : <label className="label">Пульс</label>}
      <input
        className="input"
        inputMode="numeric"
        placeholder={compact ? 'Пульс' : undefined}
        title={hint}
        aria-label={hint}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={onPointerDown}
      />
    </div>
  )
}
