import { useEffect, useRef, useState } from 'react'
import { loyaltyArchiveWarnText } from '../lib/loyalty/loyaltyClientMutationCore.js'
import { loadLoyaltyWarnSnapshot } from '../lib/loyalty/loyaltyWarnService.js'
import { shouldShowLoyaltyUi } from '../lib/loyalty/loyaltyGlanceUiCore.js'

/**
 * Текст в модалке архива: GET баллов, иначе last-good, иначе «не удалось».
 */
export function useLoyaltyArchiveWarn(client, enabled) {
  const showUi = shouldShowLoyaltyUi(client)
  const clientId = String(client?.id ?? '')
  const clientRef = useRef(client)
  clientRef.current = client
  const [text, setText] = useState('')

  useEffect(() => {
    if (!enabled || !showUi || !clientId) {
      setText('')
      return
    }
    let cancelled = false
    void loadLoyaltyWarnSnapshot(clientRef.current).then((snap) => {
      if (cancelled) return
      setText(snap.show ? loyaltyArchiveWarnText(snap) : '')
    })
    return () => {
      cancelled = true
    }
  }, [enabled, showUi, clientId])

  return text
}
