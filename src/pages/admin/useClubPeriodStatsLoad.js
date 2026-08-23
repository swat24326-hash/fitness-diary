/**
 * Сводка периода (detail): light + ПНК + CQ параллельно.
 * Full CQ всегда свежий с сети при открытии/смене периода (не glance-TTL).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import { refreshMembershipsForStats } from '../../lib/membershipCacheRefresh'
import { loadClubTrainingStats } from '../../lib/dataAccess'
import { ensureClubPeriodCoachQuality } from '../../lib/admin/adminClubStatsService'
import { fetchCoachQualityViaApi, fetchClientRetentionViaApi, fetchClientAttendanceViaApi } from '../../lib/admin/adminApiClient'
import { loadClubAttendanceFromLocal } from '../../lib/admin/clubAttendanceLocalService.js'
import { preferClubAttendancePayload, isClubAttendancePayloadIncomplete } from '../../lib/admin/clubAttendanceAggCore.js'
import {
  ensureTrainerPeriodCoachQuality,
  loadTrainerPeriodStats,
} from '../../lib/trainer/trainerPeriodStatsService'
import { useDebouncedStorageReload, shouldReloadAdminStatsPage, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { fetchPnkBundle } from '../../lib/pnk/pnkApiService'
import { loadLocalPnkFunnelUiStats } from '../../lib/pnk/pnkLocalService'
import { invalidateAdminCoachQualityGlance } from '../../lib/admin/coachQualityGlanceSession.js'
import { getDateRange } from '../../lib/period.js'

export function useClubPeriodStatsLoad({
  clubId,
  isTrainerScope,
  scopeTrainerId,
  scopeClubId,
  range,
  /** @type {'pz'|'tz'|'az'|null|undefined} */
  hall = null,
}) {
  const [busy, setBusy] = useState(false)
  const [coachQualityBusy, setCoachQualityBusy] = useState(false)
  const [clientRetentionBusy, setClientRetentionBusy] = useState(false)
  const [clientAttendanceBusy, setClientAttendanceBusy] = useState(false)
  const [stats, setStats] = useState(null)
  const [pnkFunnel, setPnkFunnel] = useState(null)
  const statsLoadGenRef = useRef(0)

  const loadPnkFunnelForRange = useCallback(async () => {
    if (hall && hall !== 'pz') return null
    const clubFilter = isTrainerScope ? scopeClubId || clubId : clubId
    if (!clubFilter) return null
    if (!isTrainerScope && isSupabaseConfigured() && isAppOnline()) {
      try {
        const bundle = await fetchPnkBundle({
          clubId: clubFilter,
          dateFrom: range.start,
          dateTo: range.end,
        })
        const s = bundle?.stats
        if (!s) return null
        return {
          entered: s.entered,
          won: s.won,
          lost: s.lost,
          open: s.open,
          conversionPct: s.conversionPct,
          nutritionPct: s.nutritionPct,
          homeworkPct: s.homeworkPct,
          packageDone: s.packageDone,
          trialDone: s.trialDone,
          trainers: s.trainers ?? [],
        }
      } catch {
        /* офлайн / ошибка API — локальный кэш */
      }
    }
    return loadLocalPnkFunnelUiStats({
      clubId: clubFilter,
      dateFrom: range.start,
      dateTo: range.end,
      trainerId: isTrainerScope ? scopeTrainerId : '',
    })
  }, [clubId, scopeClubId, scopeTrainerId, isTrainerScope, range.start, range.end, hall])

  /** Detail: всегда сеть/ensure, без glance-TTL. */
  const fetchCoachQualityFresh = useCallback(
    async (periodStats) => {
      if (hall && hall !== 'pz') return { ...periodStats, coachQuality: null }
      const clubForCq = isTrainerScope ? scopeClubId || clubId : clubId
      if (isSupabaseConfigured() && isAppOnline() && clubForCq) {
        try {
          const api = await fetchCoachQualityViaApi({
            clubId: clubForCq,
            dateFrom: range.start,
            dateTo: range.end,
            trainerId: isTrainerScope ? scopeTrainerId : '',
            mode: 'full',
          })
          if (api?.coachQuality?.trainers?.length) {
            return { ...periodStats, coachQuality: api.coachQuality }
          }
        } catch {
          /* fallback ниже */
        }
      }
      return isTrainerScope
        ? ensureTrainerPeriodCoachQuality(periodStats, {
            trainerId: scopeTrainerId,
            clubId: scopeClubId || null,
            dateFrom: range.start,
            dateTo: range.end,
          })
        : ensureClubPeriodCoachQuality(periodStats, {
            clubId,
            dateFrom: range.start,
            dateTo: range.end,
          })
    },
    [clubId, scopeClubId, scopeTrainerId, isTrainerScope, range.start, range.end, hall],
  )

  const loadStats = useCallback(
    async ({ silent = false } = {}) => {
      const canLoad = isTrainerScope ? scopeTrainerId : clubId
      const gen = ++statsLoadGenRef.current
      if (!canLoad || !range.start || !range.end || range.start > range.end) {
        setStats(null)
        setPnkFunnel(null)
        setCoachQualityBusy(false)
        setClientRetentionBusy(false)
        setClientAttendanceBusy(false)
        return
      }
      if (!silent) setBusy(true)
      setCoachQualityBusy(true)
      setClientRetentionBusy(true)
      setClientAttendanceBusy(true)
      try {
        if (isSupabaseConfigured() && isAppOnline()) {
          await refreshMembershipsForStats({
            clubId: isTrainerScope ? scopeClubId : clubId,
            trainerId: isTrainerScope ? scopeTrainerId : null,
            adminClubScope: !isTrainerScope,
            notify: false,
          })
        }
        if (gen !== statsLoadGenRef.current) return

        const lightPromise = isTrainerScope
          ? loadTrainerPeriodStats({
              trainerId: scopeTrainerId,
              clubId: scopeClubId || null,
              dateFrom: range.start,
              dateTo: range.end,
              includeCoachQuality: false,
            })
          : loadClubTrainingStats({
              clubId,
              dateFrom: range.start,
              dateTo: range.end,
              includeCoachQuality: false,
              hall: hall || 'pz',
            })

        const pnkPromise = loadPnkFunnelForRange().catch(() => null)

        const wantCq = !hall || hall === 'pz'
        const clubForCq = isTrainerScope ? scopeClubId || clubId : clubId
        const cqApiPromise =
          wantCq && isSupabaseConfigured() && isAppOnline() && clubForCq
            ? fetchCoachQualityViaApi({
                clubId: clubForCq,
                dateFrom: range.start,
                dateTo: range.end,
                trainerId: isTrainerScope ? scopeTrainerId : '',
                mode: 'full',
              }).catch(() => null)
            : Promise.resolve(null)

        const retentionApiPromise =
          wantCq && isSupabaseConfigured() && isAppOnline() && clubForCq
            ? fetchClientRetentionViaApi({
                clubId: clubForCq,
                dateFrom: range.start,
                dateTo: range.end,
                trainerId: isTrainerScope ? scopeTrainerId : '',
              }).catch(() => null)
            : Promise.resolve(null)

        const attendanceApiPromise =
          wantCq && isSupabaseConfigured() && isAppOnline() && clubForCq
            ? fetchClientAttendanceViaApi({
                clubId: clubForCq,
                dateFrom: range.start,
                dateTo: range.end,
                trainerId: isTrainerScope ? scopeTrainerId : '',
              }).catch(() => null)
            : Promise.resolve(null)

        const s = await lightPromise
        if (gen !== statsLoadGenRef.current) return
        setStats(s)
        if (!silent) setBusy(false)

        const pnk = await pnkPromise
        if (gen !== statsLoadGenRef.current) return
        setPnkFunnel(pnk)

        if (!wantCq) {
          if (gen === statsLoadGenRef.current) {
            setCoachQualityBusy(false)
            setClientRetentionBusy(false)
            setClientAttendanceBusy(false)
          }
          return
        }

        try {
          let withCq = s
          if ((s?.coachQuality?.trainers ?? []).length === 0) {
            const api = await cqApiPromise
            if (gen !== statsLoadGenRef.current) return
            if (api?.coachQuality?.trainers?.length) {
              withCq = { ...s, coachQuality: api.coachQuality }
            } else {
              withCq = await fetchCoachQualityFresh(s)
            }
          }
          const [retentionApi, attendanceApi] = await Promise.all([
            retentionApiPromise,
            attendanceApiPromise,
          ])
          if (gen !== statsLoadGenRef.current) return
          if (retentionApi?.clientRetention) {
            withCq = { ...withCq, clientRetention: retentionApi.clientRetention }
          }
          let attendance = attendanceApi?.clientAttendance ?? null
          const hintCompleted = Number(s?.totalCompleted) || 0
          if (clubForCq && (!attendance || isClubAttendancePayloadIncomplete(attendance))) {
            try {
              const local = await loadClubAttendanceFromLocal({
                clubId: clubForCq,
                dateFrom: range.start,
                dateTo: range.end,
                trainerIdFilter: isTrainerScope ? scopeTrainerId : null,
                hintCompletedInPeriod: hintCompleted,
              })
              attendance = preferClubAttendancePayload(attendance, local)
            } catch {
              attendance = preferClubAttendancePayload(attendance, null)
            }
          }
          if (attendance) {
            withCq = { ...withCq, clientAttendance: attendance }
          }
          if (gen !== statsLoadGenRef.current) return
          setStats((prev) => {
            if (!prev) return withCq
            return {
              ...prev,
              coachQuality: withCq?.coachQuality ?? prev.coachQuality ?? null,
              clientRetention: withCq?.clientRetention ?? prev.clientRetention ?? null,
              clientAttendance: withCq?.clientAttendance ?? prev.clientAttendance ?? null,
            }
          })
        } catch {
          if (gen === statsLoadGenRef.current) {
            setStats((prev) =>
              prev
                ? {
                    ...prev,
                    coachQuality: prev.coachQuality ?? null,
                    clientRetention: prev.clientRetention ?? null,
                    clientAttendance: prev.clientAttendance ?? null,
                  }
                : prev,
            )
          }
        } finally {
          if (gen === statsLoadGenRef.current) {
            setCoachQualityBusy(false)
            setClientRetentionBusy(false)
            setClientAttendanceBusy(false)
          }
        }
      } catch {
        if (gen !== statsLoadGenRef.current) return
        setStats(null)
        setPnkFunnel(null)
        setCoachQualityBusy(false)
        setClientRetentionBusy(false)
        setClientAttendanceBusy(false)
      } finally {
        if (gen === statsLoadGenRef.current && !silent) setBusy(false)
      }
    },
    [
      clubId,
      scopeClubId,
      scopeTrainerId,
      isTrainerScope,
      range.start,
      range.end,
      hall,
      loadPnkFunnelForRange,
      fetchCoachQualityFresh,
    ],
  )

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useDebouncedStorageReload(
    () => {
      if (clubId) invalidateAdminCoachQualityGlance(clubId)
      void loadStats({ silent: true })
    },
    {
      shouldRun: isTrainerScope ? shouldReloadTrainerClientList : shouldReloadAdminStatsPage,
    },
  )

  return {
    busy,
    coachQualityBusy,
    clientRetentionBusy,
    clientAttendanceBusy,
    stats,
    pnkFunnel,
    loadStats,
  }
}

/** Для главной: месяц. */
export function monthRangeForCoachQualityGlance() {
  return getDateRange('month')
}
