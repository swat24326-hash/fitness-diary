import { useCallback, useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'
import { loadLoyaltyAccountWithCache } from '../lib/loyalty/loyaltyGlanceService.js'
import { shouldShowLoyaltyUi } from '../lib/loyalty/loyaltyGlanceUiCore.js'

/**
 * Вкладка «Баллы»: GET loyalty-account, офлайн — last-good из IDB.
 */
export function useClientLoyalty(client) {
  const clientId = String(client?.id ?? '')
  const visible = shouldShowLoyaltyUi(client)
  const [snapshot, setSnapshot] = useState(null)
  const [source, setSource] = useState('none')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!visible || !clientId) {
      setSnapshot(null)
      setSource('none')
      return
    }
    setBusy(true)
    try {
      const r = await loadLoyaltyAccountWithCache(clientId)
      setSnapshot(r.snapshot)
      setSource(r.source)
    } finally {
      setBusy(false)
    }
  }, [clientId, visible])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onStorage = (e) => {
      const reason = String(e?.detail?.reason ?? '')
      if (reason === 'loyalty-glance' || reason === 'sync-complete') void reload()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onStorage)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onStorage)
  }, [reload])

  return { snapshot, source, busy, visible, reload }
}
