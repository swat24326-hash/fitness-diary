import { useCallback, useEffect, useMemo, useState } from 'react'
import { listClientsByTrainerId } from '../lib/localDbClubQuery'
import { listTrainerScheduleEntries } from '../lib/trainer/trainerScheduleService'
import { loadTrainingsByIds } from '../lib/trainer/trainerScheduleTrainingService.js'
import {
  useDebouncedStorageReload,
} from '../lib/useDebouncedStorageReload.js'
import { shouldReloadTrainerScheduleData } from '../lib/trainer/trainerScheduleCore.js'

/**
 * @param {string | undefined | null} trainerId
 * @param {string | undefined | null} clubId
 */
export function useTrainerScheduleData(trainerId, clubId) {
  const [entries, setEntries] = useState([])
  const [clients, setClients] = useState([])
  const [trainingById, setTrainingById] = useState({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (opts = {}) => {
    const silent = opts?.silent === true
    const tid = String(trainerId ?? '').trim()
    if (!tid) {
      setEntries([])
      setClients([])
      setTrainingById({})
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const [scheduleRows, clientRows] = await Promise.all([
        listTrainerScheduleEntries(tid),
        listClientsByTrainerId(tid),
      ])
      const cid = String(clubId ?? '').trim()
      const linkedIds = scheduleRows.map((e) => e.linked_training_id).filter(Boolean)
      const trainings = await loadTrainingsByIds(linkedIds)
      setEntries(scheduleRows)
      setTrainingById(trainings)
      setClients(
        (clientRows ?? [])
          .filter((c) => !cid || String(c?.club_id) === cid)
          .filter((c) => !c?.archived_at)
          .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru')),
      )
    } finally {
      setLoading(false)
    }
  }, [trainerId, clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  useDebouncedStorageReload(() => reload({ silent: true }), {
    shouldRun: shouldReloadTrainerScheduleData,
  })

  const clientNameById = useMemo(() => {
    /** @type {Record<string, string>} */
    const map = {}
    for (const c of clients) {
      const id = String(c?.id ?? '').trim()
      if (!id) continue
      map[id] = String(c?.name ?? '').trim() || 'Клиент'
    }
    return map
  }, [clients])

  return { entries, clients, clientNameById, trainingById, loading, reload }
}
