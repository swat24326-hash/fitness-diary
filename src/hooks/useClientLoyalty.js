import { useCallback, useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'
import { getLoyaltyGlance } from '../lib/loyalty/loyaltyGlanceCache.js'
import { shouldReloadLoyaltyAccountOnLocalData } from '../lib/loyalty/loyaltyAccountReloadGateCore.js'
import { loadLoyaltyAccountWithCache } from '../lib/loyalty/loyaltyGlanceService.js'
import { isLoyaltySnapshot, shouldShowLoyaltyUi } from '../lib/loyalty/loyaltyGlanceUiCore.js'
import { isAppOnline } from '../lib/networkReachability.js'

/**
 * Вкладка «Баллы»: GET loyalty-account, офлайн — last-good из IDB.
 * Не слушаем `loyalty-glance`: его шлёт наш же GET → цикл и тряска экрана.
 */
export function useClientLoyalty(client) {
  const clientId = String(client?.id ?? '')
  const visible = shouldShowLoyaltyUi(client)
  const [snapshot, setSnapshot] = useState(null)
  const [source, setSource] = useState('none')
  const [busy, setBusy] = useState(() => Boolean(visible && clientId))

  const reload = useCallback(async () => {
    if (!visible || !clientId) {
      setSnapshot(null)
      setSource('none')
      setBusy(false)
      return
    }
    setBusy(true)
    try {
      const cached = await getLoyaltyGlance(clientId)
      if (isLoyaltySnapshot(cached)) {
        setSnapshot(cached)
        if (!isAppOnline()) {
          setSource('cache')
          setBusy(false)
          return
        }
        // Онлайн: цифры из кэша сразу, без баннера «с устройства» (иначе мигает высота).
        setBusy(false)
      }
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
      if (!shouldReloadLoyaltyAccountOnLocalData(e?.detail?.reason)) return
      void reload()
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onStorage)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onStorage)
  }, [reload])

  return { snapshot, source, busy, visible, reload }
}
