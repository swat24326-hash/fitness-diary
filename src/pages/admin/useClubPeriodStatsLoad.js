import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabase'
import { isAppOnline } from '../../lib/syncService'
import { refreshMembershipsForStats } from '../../lib/membershipCacheRefresh'
import { loadClubTrainingStats } from '../../lib/dataAccess'
import { ensureClubPeriodCoachQuality } from '../../lib/admin/adminClubStatsService'
import {
  ensureTrainerPeriodCoachQuality,
  loadTrainerPeriodStats,
} from '../../lib/trainer/trainerPeriodStatsService'
import { useDebouncedStorageReload, shouldReloadAdminStatsPage, shouldReloadTrainerClientList } from '../../lib/useDebouncedStorageReload'
import { fetchPnkBundle } from '../../lib/pnk/pnkApiService'
import { loadLocalPnkFunnelUiStats } from '../../lib/pnk/pnkLocalService'

/**
 * Сводка периода: сначала лёгкие цифры + ПНК, «Качество ведения» — вторым шагом.
 * @param {{
 *   clubId: string,
 *   isTrainerScope: boolean,
 *   scopeTrainerId: string,
 *   scopeClubId: string,
 *   range: { start: string, end: string },
 * }} p
 */
export function useClubPeriodStatsLoad({
  clubId,
  isTrainerScope,
  scopeTrainerId,
  scopeClubId,
  range,
}) {
  const [busy, setBusy] = useState(false)
  const [coachQualityBusy, setCoachQualityBusy] = useState(false)
  const [stats, setStats] = useState(null)
  const [pnkFunnel, setPnkFunnel] = useState(null)
  const statsLoadGenRef = useRef(0)

  const loadPnkFunnelForRange = useCallback(async () => {
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
        /* офлайн / ошибка API — локальный кэш по клубу */
      }
    }
    return loadLocalPnkFunnelUiStats({
      clubId: clubFilter,
      dateFrom: range.start,
      dateTo: range.end,
      trainerId: isTrainerScope ? scopeTrainerId : '',
    })
  }, [clubId, scopeClubId, scopeTrainerId, isTrainerScope, range.start, range.end])

  const loadStats = useCallback(async ({ silent = false } = {}) => {
    const canLoad = isTrainerScope ? scopeTrainerId : clubId
    const gen = ++statsLoadGenRef.current
    if (!canLoad || !range.start || !range.end || range.start > range.end) {
      setStats(null)
      setPnkFunnel(null)
      setCoachQualityBusy(false)
      return
    }
    if (!silent) setBusy(true)
    setCoachQualityBusy(false)
    try {
      if (isSupabaseConfigured() && isAppOnline()) {
        await refreshMembershipsForStats({
          clubId: isTrainerScope ? scopeClubId : clubId,
          trainerId: isTrainerScope ? scopeTrainerId : null,
          notify: false,
        })
      }
      if (gen !== statsLoadGenRef.current) return

      const [s, pnk] = await Promise.all([
        isTrainerScope
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
            }),
        loadPnkFunnelForRange().catch(() => null),
      ])
      if (gen !== statsLoadGenRef.current) return
      setStats(s)
      setPnkFunnel(pnk)
      if (!silent) setBusy(false)

      if ((s?.coachQuality?.trainers ?? []).length > 0) {
        setCoachQualityBusy(false)
        return
      }

      setCoachQualityBusy(true)
      try {
        const withCq = isTrainerScope
          ? await ensureTrainerPeriodCoachQuality(s, {
              trainerId: scopeTrainerId,
              clubId: scopeClubId || null,
              dateFrom: range.start,
              dateTo: range.end,
            })
          : await ensureClubPeriodCoachQuality(s, {
              clubId,
              dateFrom: range.start,
              dateTo: range.end,
            })
        if (gen !== statsLoadGenRef.current) return
        setStats((prev) => {
          if (!prev) return withCq
          return { ...prev, coachQuality: withCq?.coachQuality ?? null }
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
  }, [
    clubId,
    scopeClubId,
    scopeTrainerId,
    isTrainerScope,
    range.start,
    range.end,
    loadPnkFunnelForRange,
  ])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useDebouncedStorageReload(() => void loadStats({ silent: true }), {
    shouldRun: isTrainerScope ? shouldReloadTrainerClientList : shouldReloadAdminStatsPage,
  })

  return { busy, coachQualityBusy, stats, pnkFunnel, loadStats }
}
