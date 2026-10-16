import { useCallback, useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../../lib/dataAccess'
import { getDb } from '../../lib/localDb'
import {
  buildTrainerNotificationsFromPlans,
  trainerNotificationsUnreadCount,
} from '../../lib/trainer/trainerNotificationsCore.js'

async function loadFeed() {
  const db = await getDb()
  const [plans, clients] = await Promise.all([db.getAll('client_plans'), db.getAll('clients')])
  const byId = new Map(clients.map((c) => [String(c.id), c]))
  const items = buildTrainerNotificationsFromPlans(plans, byId)
  return { items, unread: trainerNotificationsUnreadCount(items) }
}

/** Лента client_plans для шапки и экрана /trainer/notifications. */
export function useTrainerNotifications() {
  const [state, setState] = useState({ items: [], unread: 0, status: 'loading' })

  const reload = useCallback(() => {
    loadFeed()
      .then(({ items, unread }) => setState({ items, unread, status: 'ready' }))
      .catch(() => setState((s) => ({ ...s, status: 'error' })))
  }, [])

  useEffect(() => {
    reload()
    const onChange = () => reload()
    window.addEventListener(LOCAL_DATA_CHANGED, onChange)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onChange)
  }, [reload])

  return { ...state, reload }
}
