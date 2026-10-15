import { useMemo } from 'react'
import { fetchCoachClients } from '../../lib/coach/coachApiClient.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { useCoachLoad } from './useCoachLoad.js'

const CLIENTS_CACHE = screenCacheKey('coach', 'clients')

/** Клиенты телефона: список + абонементы по клиенту в виде, который ждут общие правила планшета. */
export function useCoachClientsData() {
  const load = useCoachLoad(fetchCoachClients, { refreshOnReturn: true, cacheKey: CLIENTS_CACHE })
  const clients = useMemo(() => load.data?.clients ?? [], [load.data])
  const memByClient = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.memberships ?? []])), [clients])
  const today = load.data?.today || todayLocalIso()
  return { ...load, clients, memByClient, today }
}
