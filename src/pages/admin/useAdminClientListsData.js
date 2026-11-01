import { useCallback, useEffect, useState } from 'react'
import { peekAdminClientsListLocal, pullAdminClientsFromCloud } from '../../lib/admin/adminClientsListService'
import { loadAdminClubMembershipsMap } from '../../lib/admin/adminClubWorkspaceCache'
import { loadAdminClubLifecycleRowsFromLocal } from '../../lib/admin/adminClientsListLifecycleCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu'
import { isSupabaseConfigured } from '../../lib/supabase'

/**
 * Клиенты + абоны + lifecycle из локального кэша (как список Клиенты).
 * @param {string} clubId
 */
export function useAdminClientListsData(clubId) {
  const club = String(clubId ?? '').trim()
  const [clients, setClients] = useState([])
  const [memByClient, setMemByClient] = useState({})
  const [lifecycleRows, setLifecycleRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [today] = useState(() => todayInTimeZoneIso('Europe/Moscow'))

  const reloadLocal = useCallback(async () => {
    if (!club) {
      setClients([])
      setMemByClient({})
      setLifecycleRows([])
      setReady(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const [localPeek, memMap, life] = await Promise.all([
        peekAdminClientsListLocal(club),
        loadAdminClubMembershipsMap(club),
        loadAdminClubLifecycleRowsFromLocal(club),
      ])
      const list = Array.isArray(localPeek?.clients) ? localPeek.clients : []
      setClients(list)
      setMemByClient(memMap && typeof memMap === 'object' ? memMap : {})
      setLifecycleRows(Array.isArray(life) ? life : [])
    } catch (e) {
      setError(String(e?.message || e || 'Не удалось загрузить список'))
    } finally {
      setBusy(false)
      setReady(true)
    }
  }, [club])

  const refreshFromCloud = useCallback(async () => {
    if (!club || !isSupabaseConfigured()) {
      await reloadLocal()
      return
    }
    setBusy(true)
    setError('')
    try {
      await pullAdminClientsFromCloud(club)
      await reloadLocal()
    } catch (e) {
      setError(String(e?.message || e || 'Облако недоступно — показан локальный кэш'))
      await reloadLocal()
    } finally {
      setBusy(false)
    }
  }, [club, reloadLocal])

  useEffect(() => {
    void reloadLocal()
  }, [reloadLocal])

  return {
    clients,
    memByClient,
    lifecycleRows,
    busy,
    ready,
    error,
    today,
    reloadLocal,
    refreshFromCloud,
  }
}
