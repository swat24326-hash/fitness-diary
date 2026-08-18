import { useEffect, useMemo, useRef, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../../lib/localDataEvents.js'
import { getLoyaltyGlanceMany } from '../../lib/loyalty/loyaltyGlanceCache.js'
import { refreshLoyaltyGlanceForClients } from '../../lib/loyalty/loyaltyGlanceService.js'
import { shouldShowLoyaltyUi } from '../../lib/loyalty/loyaltyGlanceUiCore.js'

/**
 * Чипы списка: IDB сразу, GET glance по id страницы (не весь клуб).
 * @param {object[]} clients
 * @param {{ fetchOnMount?: boolean }} [opts]
 */
export function useLoyaltyGlanceMap(clients, opts = {}) {
  const fetchOnMount = opts.fetchOnMount !== false
  const clientsRef = useRef(clients)
  clientsRef.current = clients
  const idsKey = useMemo(() => {
    const list = Array.isArray(clients) ? clients : []
    return list
      .filter(shouldShowLoyaltyUi)
      .map((c) => String(c.id ?? '').trim())
      .filter(Boolean)
      .join(',')
  }, [clients])
  const [byId, setById] = useState(/** @type {Record<string, object>} */ ({}))

  useEffect(() => {
    let cancelled = false
    const ids = idsKey ? idsKey.split(',').filter(Boolean) : []
    const targets = (Array.isArray(clientsRef.current) ? clientsRef.current : []).filter(shouldShowLoyaltyUi)

    async function readCache() {
      const cached = await getLoyaltyGlanceMany(ids)
      if (!cancelled) setById(cached)
    }

    async function fetchLive() {
      if (!ids.length) {
        if (!cancelled) setById({})
        return
      }
      await readCache()
      if (!fetchOnMount) return
      await refreshLoyaltyGlanceForClients(targets)
      if (cancelled) return
      await readCache()
    }

    void fetchLive()
    return () => {
      cancelled = true
    }
  }, [idsKey, fetchOnMount])

  useEffect(() => {
    const onStorage = (e) => {
      const reason = String(e?.detail?.reason ?? '')
      if (reason !== 'loyalty-glance' && reason !== 'sync-complete') return
      const ids = idsKey ? idsKey.split(',').filter(Boolean) : []
      void getLoyaltyGlanceMany(ids).then(setById)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onStorage)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onStorage)
  }, [idsKey])

  return byId
}
