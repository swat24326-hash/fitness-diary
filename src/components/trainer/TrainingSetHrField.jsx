import { useRef } from 'react'
import { useHeartRateSessions } from '../../context/HeartRateSessionsContext'
import { useAppToast } from '../../hooks/useAppToast'
import { AppToast } from '../AppToast'
import {
  HR_AFTER_DOUBLE_TAP_MS,
  hrAfterFillUserMessage,
  hrAfterFromLiveSlot,
} from '../../lib/hr/hrAfterFromLiveSlot.js'

/**
 * Ячейка «Пульс» подхода: ручной ввод + двойной тап → текущий BPM с датчика клиента.
 * Визуал как у обычного input — без вспышек и кнопок.
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   clientId?: string,
 *   title?: string,
 * }} props
 */
export function TrainingSetHrField({ value, onChange, clientId = '', title }) {
  const hr = useHeartRateSessions()
  const { showToast, toast } = useAppToast(2400)
  const lastTapAtRef = useRef(0)

  const hint =
    title ||
    'Пульс после подхода (уд/мин). Двойной тап — текущий пульс с датчика'

  const tryFillFromLive = () => {
    const slot = hr.slotForClient?.(clientId) ?? null
    const result = hrAfterFromLiveSlot(slot)
    if (result.ok) {
      onChange(result.value)
      return
    }
    showToast(hrAfterFillUserMessage(result.reason), 'warn')
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
    <div className="field">
      <label className="label">Пульс</label>
      <input
        className="input"
        inputMode="numeric"
        title={hint}
        aria-label={hint}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={onPointerDown}
      />
      <AppToast toast={toast} />
    </div>
  )
}
