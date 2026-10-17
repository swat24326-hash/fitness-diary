import { useCallback, useEffect, useMemo, useState } from 'react'
import { todayLocalIso } from '../lib/dateRu.js'
import { listClientsByTrainerId, listMembershipsMapByClientIds } from '../lib/localDbClubQuery'
import { listMembershipTypesForClub } from '../lib/membershipTypesService.js'
import { buildScheduleClientInfoById } from '../lib/trainer/trainerScheduleClientInfoCore.js'
import { isScheduleEntryUnsent } from '../lib/trainer/trainerScheduleDeliveryCore.js'
import { listTrainerScheduleEntries } from '../lib/trainer/trainerScheduleService'
import { loadTrainingsByIds } from '../lib/trainer/trainerScheduleTrainingService.js'
import {
  useDebouncedStorageReload,
} from '../lib/useDebouncedStorageReload.js'
import { shouldReloadTrainerScheduleData } from '../lib/trainer/trainerScheduleCore.js'

const UNSENT_RECHECK_MS = 5000

/**
 * @param {string | undefined | null} trainerId
 * @param {string | undefined | null} clubId
 */
export function useTrainerScheduleData(trainerId, clubId) {
  const [entries, setEntries] = useState([])
  const [clients, setClients] = useState([])
  const [clientInfoById, setClientInfoById] = useState({})
  const [trainingById, setTrainingById] = useState({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (opts = {}) => {
    const silent = opts?.silent === true
    const tid = String(trainerId ?? '').trim()
    if (!tid) {
      setEntries([])
      setClients([])
      setClientInfoById({})
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
      const activeClients = (clientRows ?? [])
        .filter((c) => !cid || String(c?.club_id) === cid)
        .filter((c) => !c?.archived_at)
        .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru'))
      const scheduleClientIds = [
        ...new Set(scheduleRows.flatMap((e) => e.client_ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
      ]
      const [membershipsMap, types] = await Promise.all([
        listMembershipsMapByClientIds(scheduleClientIds),
        cid ? listMembershipTypesForClub(cid) : Promise.resolve([]),
      ])
      setEntries(scheduleRows)
      setTrainingById(trainings)
      setClients(activeClients)
      setClientInfoById(buildScheduleClientInfoById(activeClients, membershipsMap, types, todayLocalIso()))
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

  /* Очередь отправляет запись в фоне без события экрану — пока есть «не отправлено», перечитываем IDB. */
  const hasUnsent = entries.some(isScheduleEntryUnsent)
  useEffect(() => {
    if (!hasUnsent) return undefined
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }, UNSENT_RECHECK_MS)
    return () => window.clearInterval(id)
  }, [hasUnsent, reload])

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

  return { entries, clients, clientNameById, clientInfoById, trainingById, loading, reload }
}
