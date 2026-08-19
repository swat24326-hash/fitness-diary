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
import { fetchCoachQualityViaApi } from '../../lib/admin/adminApiClient'
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
        return
      }
      if (!silent) setBusy(true)
      setCoachQualityBusy(true)
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

        const s = await lightPromise
        if (gen !== statsLoadGenRef.current) return
        setStats(s)
        if (!silent) setBusy(false)

        const pnk = await pnkPromise
        if (gen !== statsLoadGenRef.current) return
        setPnkFunnel(pnk)

        if (!wantCq) {
          if (gen === statsLoadGenRef.current) setCoachQualityBusy(false)
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
          if (gen !== statsLoadGenRef.current) return
          setStats((prev) => {
            if (!prev) return withCq
            return { ...prev, coachQuality: withCq?.coachQuality ?? prev.coachQuality ?? null }
          })
        } catch {
          if (gen === statsLoadGenRef.current) {
            setStats((prev) => (prev ? { ...prev, coachQuality: prev.coachQuality ?? null } : prev))
          }
        } finally {
          if (gen === statsLoadGenRef.current) setCoachQualityBusy(false)
        }
      } catch {
        if (gen !== statsLoadGenRef.current) return
        setStats(null)
        setPnkFunnel(null)
        setCoachQualityBusy(false)
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

  return { busy, coachQualityBusy, stats, pnkFunnel, loadStats }
}

/** Для главной: месяц. */
export function monthRangeForCoachQualityGlance() {
  return getDateRange('month')
}
