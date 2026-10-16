import { useCallback } from 'react'
import { clientInviteTokenFromScan } from '../../lib/client/clientInviteTokenCore.js'
import { useQrFrameScan } from '../../hooks/useQrFrameScan.js'

/** Камера → токен приглашения клиента. */
export function useClientQrScan({ active, onToken }) {
  const onCode = useCallback(
    (raw) => {
      const token = clientInviteTokenFromScan(raw)
      if (!token) return false
      onToken(token)
      return true
    },
    [onToken],
  )
  const scan = useQrFrameScan({ active, onCode })
  return scan
}
