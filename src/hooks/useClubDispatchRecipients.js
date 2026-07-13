import { useCallback, useEffect, useState } from 'react'
import { fetchTrainersViaAdminApi } from '../lib/admin/adminApiClient.js'
import { isSalesManagerRole } from '../lib/admin/salesAccessCore.js'
import { isQaAutoUser } from '../lib/admin/qaAutoUserCore.js'

/**
 * Список исполнителей для Планёрки: тренеры и (опционально) менеджеры продаж.
 * @param {string} clubId
 * @param {{ includeSalesManagers?: boolean }} [opts]
 */
export function useClubDispatchRecipients(clubId, opts = {}) {
  const includeSalesManagers = opts.includeSalesManagers === true
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    const cid = String(clubId ?? '').trim()
    if (!cid) {
      setRecipients([])
      return
    }
    setLoading(true)
    try {
      const [trainersRes, managersRes] = await Promise.all([
        fetchTrainersViaAdminApi(),
        includeSalesManagers ? fetchTrainersViaAdminApi({ role: 'sales_manager' }) : Promise.resolve(null),
      ])
      const trainers = (trainersRes?.trainers ?? [])
        .filter((t) => String(t.club_id ?? '') === cid && t.is_active !== false && !isQaAutoUser(t))
        .map((t) => ({
          trainer_id: String(t.id),
          trainer_name: String(t.name ?? '').trim() || String(t.id),
          role_label: 'Тренер',
        }))
      const managers = includeSalesManagers
        ? (managersRes?.trainers ?? [])
            .filter(
              (t) =>
                String(t.club_id ?? '') === cid && t.is_active !== false && !isQaAutoUser(t) && isSalesManagerRole(t.role),
            )
            .map((t) => ({
              trainer_id: String(t.id),
              trainer_name: String(t.name ?? '').trim() || String(t.id),
              role_label: 'Менеджер продаж',
            }))
        : []
      setRecipients([...managers, ...trainers])
    } catch {
      setRecipients([])
    } finally {
      setLoading(false)
    }
  }, [clubId, includeSalesManagers])

  useEffect(() => {
    void reload()
  }, [reload])

  return { recipients, loading, reload }
}
