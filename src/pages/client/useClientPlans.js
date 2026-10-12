import { useCallback, useEffect, useState } from 'react'
import { markClientPlanSeen } from '../../lib/client/clientPlanUiCore.js'
import { ClientSessionGoneError, patchClientMeCache } from '../../lib/client/clientSession.js'
import { fetchClientPlanItem, fetchClientPlanList } from '../../lib/client/clientPlansService.js'

/**
 * /me/task и /me/nutrition: список отправок + открытое задание (по умолчанию — последнее).
 * @returns {{ status: 'loading'|'ready'|'empty'|'error'|'signed_out', items: object[], item: object|null, offline: boolean, error: string, openingId: string, open: (id: string) => void, reload: () => void }}
 */
export function useClientPlans(kind) {
  const [state, setState] = useState({ status: 'loading', items: [], item: null, offline: false, error: '', openingId: '' })

  const openItem = useCallback(async (id) => {
    setState((s) => ({ ...s, openingId: id, error: '' }))
    try {
      const { item, offline } = await fetchClientPlanItem(id)
      if (!offline) patchClientMeCache((data) => ({ ...data, plans: markClientPlanSeen(data.plans, id) }))
      setState((s) => ({ ...s, item, offline: s.offline || offline, openingId: '' }))
    } catch (e) {
      if (e instanceof ClientSessionGoneError) return setState((s) => ({ ...s, status: 'signed_out' }))
      setState((s) => ({ ...s, openingId: '', error: e?.message || 'Не удалось открыть — попробуйте ещё раз' }))
    }
  }, [])

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, status: s.items.length ? s.status : 'loading', error: '' }))
    try {
      const { items, offline } = await fetchClientPlanList(kind)
      setState((s) => ({ ...s, items, offline, status: items.length ? 'ready' : 'empty' }))
      if (items[0]) await openItem(items[0].id)
    } catch (e) {
      if (e instanceof ClientSessionGoneError) return setState((s) => ({ ...s, status: 'signed_out' }))
      setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не удалось загрузить' }))
    }
  }, [kind, openItem])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, open: openItem, reload }
}
