import { useCallback, useEffect, useState } from 'react'
import { loadClubTrainerScheduleRange } from '../lib/admin/trainerScheduleAdminService.js'

/**
 * Ежедневники тренеров клуба — read-only через admin-data API.
 * @param {{ clubId: string, trainerId?: string, dayFrom: string, dayTo: string }} opts
 */
export function useClubTrainerScheduleData({ clubId, trainerId = '', dayFrom, dayTo }) {
  const [entries, setEntries] = useState([])
  const [clientNameById, setClientNameById] = useState({})
  const [trainerNameById, setTrainerNameById] = useState({})
  const [trainingById, setTrainingById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)

  const reload = useCallback(async () => {
    const cid = String(clubId ?? '').trim()
    const from = String(dayFrom ?? '').slice(0, 10)
    const to = String(dayTo ?? '').slice(0, 10)
    if (!cid || !from || !to) {
      setEntries([])
      setClientNameById({})
      setTrainerNameById({})
      setTrainingById({})
      setTruncated(false)
      setError('')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await loadClubTrainerScheduleRange({
        clubId: cid,
        trainerId,
        dayFrom: from,
        dayTo: to,
      })
      if (!res.ok) {
        setEntries([])
        setClientNameById({})
        setTrainerNameById({})
        setTrainingById({})
        setTruncated(false)
        setError(res.error ?? 'Не удалось загрузить расписание')
        return
      }
      setEntries(res.entries)
      setClientNameById(res.clientNameById)
      setTrainerNameById(res.trainerNameById)
      setTrainingById(res.trainingById)
      setTruncated(Boolean(res.truncated))
    } catch (e) {
      setEntries([])
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [clubId, trainerId, dayFrom, dayTo])

  useEffect(() => {
    void reload()
  }, [reload])

  return { entries, clientNameById, trainerNameById, trainingById, loading, error, truncated, reload }
}
