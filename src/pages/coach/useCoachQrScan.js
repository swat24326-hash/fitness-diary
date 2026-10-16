import { useCallback, useRef } from 'react'
import { coachInviteScanFromRaw } from '../../lib/coach/coachInviteTokenCore.js'
import { useQrFrameScan } from '../../hooks/useQrFrameScan.js'

/**
 * Камера → разбор QR тренера.
 * @param {{ active: boolean, onScan: (p: { kind: 'qr' | 'handoff', token: string }) => void }} opts
 */
export function useCoachQrScan({ active, onScan }) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const onCode = useCallback((raw) => {
    const parsed = coachInviteScanFromRaw(raw)
    if (!parsed) return false
    onScanRef.current(parsed)
    return true
  }, [])
  return useQrFrameScan({ active, onCode })
}
