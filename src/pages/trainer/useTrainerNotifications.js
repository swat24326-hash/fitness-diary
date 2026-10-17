import { useCallback, useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../../lib/dataAccess'
import { getDb } from '../../lib/localDb'
import { fetchClientAppStatus } from '../../lib/client/clientInviteService.js'
import {
  buildTrainerNotificationsFromPlans,
  trainerNotificationPendingClientIds,
  trainerNotificationsUnreadCount,
} from '../../lib/trainer/trainerNotificationsCore.js'

async function loadHasAppMap(clientIds) {
  /** @type {Map<string, boolean>} */
  const map = new Map()
  if (!clientIds?.length) return map
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return map
  await Promise.all(
    clientIds.map(async (id) => {
      const r = await fetchClientAppStatus(id)
      // Только уверенный ответ; при сбое сети ключ не ставим — лента как раньше.
      if (r?.ok) map.set(id, Boolean(r.has_app))
    }),
  )
  return map
}

async function loadFeed() {
  const db = await getDb()
  const [plans, clients] = await Promise.all([db.getAll('client_plans'), db.getAll('clients')])
  const byId = new Map(clients.map((c) => [String(c.id), c]))
  const pendingIds = trainerNotificationPendingClientIds(plans)
  const hasAppByClientId = await loadHasAppMap(pendingIds)
  const items = buildTrainerNotificationsFromPlans(plans, byId, { hasAppByClientId })
  return { items, unread: trainerNotificationsUnreadCount(items) }
}

/**
 * Лента client_plans для шапки и вкладки «От клиентов».
 * @param {boolean} [enabled=true] — false у не-тренера (хук в AppHeader без лишней загрузки IDB).
 */
export function useTrainerNotifications(enabled = true) {
  const [state, setState] = useState({
    items: [],
    unread: 0,
    status: enabled ? 'loading' : 'ready',
  })

  const reload = useCallback(() => {
    if (!enabled) return
    loadFeed()
      .then(({ items, unread }) => setState({ items, unread, status: 'ready' }))
      .catch(() => setState((s) => ({ ...s, status: 'error' })))
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], unread: 0, status: 'ready' })
      return undefined
    }
    reload()
    const onChange = () => reload()
    window.addEventListener(LOCAL_DATA_CHANGED, onChange)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onChange)
  }, [enabled, reload])

  return { ...state, reload }
}
