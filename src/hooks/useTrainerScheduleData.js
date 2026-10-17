import { useCallback, useEffect, useState } from 'react'
import { todayLocalIso } from '../lib/dateRu.js'
import { getDb } from '../lib/localDb.js'
import { listClientsByTrainerId, listMembershipsMapByClientIds } from '../lib/localDbClubQuery'
import { listMembershipTypesForClub } from '../lib/membershipTypesService.js'
import { filterTrainerSchedulePickerClients } from '../lib/trainer/trainerClientsPzListCore.js'
import { buildScheduleClientInfoById } from '../lib/trainer/trainerScheduleClientInfoCore.js'
import { isScheduleEntryUnsent } from '../lib/trainer/trainerScheduleDeliveryCore.js'
import { listTrainerScheduleEntries } from '../lib/trainer/trainerScheduleService'
import { loadTrainingsByIds } from '../lib/trainer/trainerScheduleTrainingService.js'
import {
  useDebouncedStorageReload,
} from '../lib/useDebouncedStorageReload.js'
import { shouldReloadTrainerScheduleData } from '../lib/trainer/trainerScheduleCore.js'

async function loadLifecycleForClientIds(clientIds) {
  const idSet = new Set((clientIds ?? []).map((id) => String(id)))
  if (!idSet.size) return []
  try {
    const db = await getDb()
    if (!db.objectStoreNames.contains('client_hall_lifecycle')) return []
    const all = await db.getAll('client_hall_lifecycle')
    return (all ?? []).filter((r) => idSet.has(String(r?.client_id ?? '')))
  } catch {
    return []
  }
}

const UNSENT_RECHECK_MS = 5000

/**
 * @param {string | undefined | null} trainerId
 * @param {string | undefined | null} clubId
 */
export function useTrainerScheduleData(trainerId, clubId) {
  const [entries, setEntries] = useState([])
  const [clients, setClients] = useState([])
  const [clientNameById, setClientNameById] = useState({})
  const [clientInfoById, setClientInfoById] = useState({})
  const [trainingById, setTrainingById] = useState({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (opts = {}) => {
    const silent = opts?.silent === true
    const tid = String(trainerId ?? '').trim()
    if (!tid) {
      setEntries([])
      setClients([])
      setClientNameById({})
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
      const notClubArchived = (clientRows ?? [])
        .filter((c) => !cid || String(c?.club_id) === cid)
        .filter((c) => !c?.archived_at)
        .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru'))
      const scheduleClientIds = [
        ...new Set(scheduleRows.flatMap((e) => e.client_ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
      ]
      const [membershipsMap, types, lifecycleRows] = await Promise.all([
        listMembershipsMapByClientIds(scheduleClientIds),
        cid ? listMembershipTypesForClub(cid) : Promise.resolve([]),
        loadLifecycleForClientIds(notClubArchived.map((c) => c.id)),
      ])
      const pickerClients = filterTrainerSchedulePickerClients(notClubArchived, lifecycleRows)
      /** @type {Record<string, string>} */
      const names = {}
      for (const c of notClubArchived) {
        const id = String(c?.id ?? '').trim()
        if (id) names[id] = String(c?.name ?? '').trim() || 'Клиент'
      }
      setEntries(scheduleRows)
      setTrainingById(trainings)
      setClients(pickerClients)
      setClientNameById(names)
      setClientInfoById(buildScheduleClientInfoById(notClubArchived, membershipsMap, types, todayLocalIso()))
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

  return { entries, clients, clientNameById, clientInfoById, trainingById, loading, reload }
}
